import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';
import PageHeader from '@/components/ui/PageHeader';
import DashboardRefresh from '@/components/dashboard/DashboardRefresh';
import { RevenueExpenseChart, ProfitExpenseLineChart, type MonthPoint } from '@/components/dashboard/DashboardCharts';
import DashboardPDFButton from '@/components/dashboard/DashboardPDFButton';
import BrokersSection from '@/components/dashboard/BrokersSection';
import CompanyPLSection from '@/components/dashboard/CompanyPLSection';
import PerVehicleSection from '@/components/dashboard/PerVehicleSection';

export const dynamic = 'force-dynamic';

/**
 * Dashboard layout (top → bottom):
 *   1. Company P&L — filterable by Month/Year (defaults to current)
 *   2. Brokers   — filterable, defaults to "All Time"
 *   3. Invoices  — consolidated summary (moved above Per-Vehicle per Yash)
 *   4. Per-Vehicle profit — filterable by Month/Year
 *   5. Year-to-date trend (12 months of revenue / expenses / profit)
 *
 * Formulas per Yash's April 2026 spec:
 *   - Vehicle Profit = Σ(gross − driver 40% − gas − extra − repairs)
 *     (debit fee and call-charge are intentionally NOT subtracted here,
 *     per Yash's explicit formula: "Gross – 40% driver – gas – extra – repairs")
 *   - Broker Profit  = Σ(broker transactions PAID+PENDING, excluding PAYOUT)
 *     − Σ(PAYOUT transactions). Stand rent is NOW correctly excluding
 *     company-subleased vehicles going forward (generate-week.ts fix).
 *   - Other Expense  = Σ(CompanyExpense for month WHERE vehicleNumber = '')
 *     (vehicle-tagged expenses already counted inside Vehicle Profit)
 *   - Cab Repairs    = Σ(CompanyExpense WHERE vehicleNumber = cab AND
 *     category IN {Cab Repair, Vehicle Maintenance}).
 */
export default async function DashboardPage() {
  const now      = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();

  // --- Phase 1: things we need to know before querying by vehicleNumber ---
  const [companyCars, investorCarCount, allInvoices] = await Promise.all([
    prisma.brokerVehicle.findMany({ where: { isCompanyCar: true }, select: { cabNumber: true } }).catch(() => [] as { cabNumber: string }[]),
    prisma.brokerVehicle.count({ where: { isCompanyCar: false, isActive: true } }).catch(() => 0),
    prisma.invoice.findMany({ orderBy: { createdAt: 'desc' } }).catch(() => [] as any[]),
  ]);
  const companyCabNumbers = companyCars.map((v) => v.cabNumber);

  // --- Phase 2: everything else in parallel ---
  // For the yearly trend, pull every month of the current year (Jan → Dec).
  const ytdMonths: { month: number; year: number }[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year: curYear }));

  const [ytdSheets, ytdCompanyExpenses, brokerTxsAll, companyExpensesMonth, curSheets, curRepairs] = await Promise.all([
    companyCabNumbers.length > 0
      ? prisma.dailySheet.findMany({
          where: { vehicleNumber: { in: companyCabNumbers }, year: curYear },
          select: {
            month: true, year: true, vehicleNumber: true,
            grossEarnings: true, netDriverPay: true, companyNet: true,
            gasDeduction: true, extraExpenseDeduction: true,
          },
        })
      : Promise.resolve([] as any[]),
    prisma.companyExpense.findMany({
      where: { year: curYear },
      select: { month: true, year: true, amount: true, vehicleNumber: true },
    }).catch(() => [] as { month: number; year: number; amount: number; vehicleNumber: string }[]),
    // Fetch ALL broker transactions (any year) in one shot. The YTD view
    // filters in-memory to the current year; the Brokers section defaults
    // to all-time per Yash's ask.
    prisma.brokerTransaction.findMany({
      where:   { status: { not: 'VOID' } },
      select:  { amount: true, type: true, status: true, month: true, year: true, brokerId: true, broker: { select: { id: true, name: true } } },
      orderBy: [{ brokerId: 'asc' }, { createdAt: 'asc' }],
    }).catch(() => [] as { amount: number; type: string; status: string; month: number; year: number; brokerId: string; broker: { id: string; name: string } }[]),
    prisma.companyExpense.findMany({
      where: { month: curMonth, year: curYear },
      select: { amount: true, vehicleNumber: true },
    }).catch(() => [] as { amount: number; vehicleNumber: string }[]),
    companyCabNumbers.length > 0
      ? prisma.dailySheet.findMany({
          where: { vehicleNumber: { in: companyCabNumbers }, month: curMonth, year: curYear },
          select: {
            vehicleNumber: true, grossEarnings: true, netDriverPay: true,
            gasDeduction: true, extraExpenseDeduction: true,
          },
        })
      : Promise.resolve([] as any[]),
    companyCabNumbers.length > 0
      ? prisma.companyExpense.findMany({
          where: {
            vehicleNumber: { in: companyCabNumbers },
            month: curMonth, year: curYear,
          },
          select: { vehicleNumber: true, amount: true },
        }).catch(() => [] as { vehicleNumber: string; amount: number }[])
      : Promise.resolve([] as { vehicleNumber: string; amount: number }[]),
  ]);

  // BrokerExpenses are charges the company bills to brokers (Yash's mental
  // model: "expense" = company income). Fetch ALL rows with broker info so
  // they contribute to both the Broker Profit cards AND the per-vehicle Other
  // column (when tagged to a company cab). No cab filter on the fetch — we
  // filter to company cabs in memory for the per-vehicle subset.
  const brokerExpensesAll = await prisma.brokerExpense.findMany({
    select:  {
      id: true, brokerId: true, cabNumber: true, amount: true, paid: true, date: true,
      broker: { select: { id: true, name: true } },
    },
    orderBy: { date: 'desc' },
  }).catch(() => [] as { id: string; brokerId: string; cabNumber: string; amount: number; paid: boolean; date: Date; broker: { id: string; name: string } }[]);

  const yearStart = new Date(curYear, 0, 1);
  const yearEnd   = new Date(curYear + 1, 0, 1);
  const brokerExpensesYear = brokerExpensesAll.filter((e) => {
    const d = new Date(e.date);
    return d >= yearStart && d < yearEnd && companyCabNumbers.includes(e.cabNumber);
  });
  const curBrokerExpenses = brokerExpensesYear.filter((e) => new Date(e.date).getMonth() + 1 === curMonth);

  // --- Current-month per-vehicle stats ---
  interface VehicleStats {
    cabNumber:  string;
    gross:      number;
    driverPay:  number; // 40%
    gas:        number;
    extra:      number;
    repairs:    number; // sum of cab-tagged Company Expenses + Broker Expenses for this cab
    profit:     number; // gross − driverPay − gas − extra − repairs
  }
  const perVehicle: VehicleStats[] = companyCabNumbers.map((cab) => {
    const sheets  = curSheets.filter((s) => s.vehicleNumber === cab);
    // Per-vehicle expense pool: CompanyExpense tagged to this cab (any category)
    // + BrokerExpense with this cab #. This way wherever Yash logs a cab-tagged
    // expense, it rolls into the cab's profit.
    const repairs =
      curRepairs.filter((r) => r.vehicleNumber === cab).reduce((a, r) => a + r.amount, 0) +
      curBrokerExpenses.filter((e) => e.cabNumber === cab).reduce((a, e) => a + e.amount, 0);
    const gross     = sheets.reduce((a, s) => a + s.grossEarnings,         0);
    const driverPay = sheets.reduce((a, s) => a + s.netDriverPay,          0);
    const gas       = sheets.reduce((a, s) => a + s.gasDeduction,          0);
    const extra     = sheets.reduce((a, s) => a + s.extraExpenseDeduction, 0);
    return {
      cabNumber: cab,
      gross, driverPay, gas, extra, repairs,
      profit: gross - driverPay - gas - extra - repairs,
    };
  }).sort((a, b) => b.profit - a.profit);

  // --- Company P&L block (current month) ---
  const vehicleProfit = perVehicle.reduce((a, v) => a + v.profit, 0);

  // Current-year slice is used by YTD logic; current-month drives the top
  // Broker Profit stat. Brokers section initial data is all-time.
  const brokerTxsYear  = brokerTxsAll.filter((t) => t.year === curYear);
  const brokerTxsMonth = brokerTxsYear.filter((t) => t.month === curMonth);

  /** Merge BrokerTransactions + BrokerExpenses into per-broker stats.
   *  Both count as company income except PAYOUT transactions (outflow). */
  function aggregateBroker(
    txs: typeof brokerTxsAll,
    exps: typeof brokerExpensesAll,
  ) {
    const map = new Map<string, { id: string; name: string; total: number; paid: number; pending: number; outflow: number }>();
    for (const t of txs) {
      const cur = map.get(t.brokerId) ?? { id: t.brokerId, name: t.broker.name, total: 0, paid: 0, pending: 0, outflow: 0 };
      if (t.type === 'PAYOUT') {
        cur.outflow += t.amount;
        cur.total   -= t.amount;
      } else {
        if (t.status === 'PAID') cur.paid    += t.amount;
        else                     cur.pending += t.amount;
        cur.total += t.amount;
      }
      map.set(t.brokerId, cur);
    }
    for (const e of exps) {
      const cur = map.get(e.brokerId) ?? { id: e.brokerId, name: e.broker.name, total: 0, paid: 0, pending: 0, outflow: 0 };
      if (e.paid) cur.paid    += e.amount;
      else        cur.pending += e.amount;
      cur.total += e.amount;
      map.set(e.brokerId, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.total - a.total);
  }

  // Current-month stats drive the P&L "Broker Profit" stat at the top.
  const brokerExpensesMonth = brokerExpensesAll.filter((e) => {
    const d = new Date(e.date);
    return d.getFullYear() === curYear && d.getMonth() + 1 === curMonth;
  });
  const brokerStatsMonth = aggregateBroker(brokerTxsMonth, brokerExpensesMonth);
  const brokerProfit     = brokerStatsMonth.reduce((a, b) => a + b.total, 0);

  // All-time stats seed the Brokers section (default filter = All Time).
  const brokerStatsAllTime = aggregateBroker(brokerTxsAll, brokerExpensesAll);
  const brokerAggregateAllTime = {
    total:       brokerStatsAllTime.reduce((a, b) => a + b.total,   0),
    paid:        brokerStatsAllTime.reduce((a, b) => a + b.paid,    0),
    pending:     brokerStatsAllTime.reduce((a, b) => a + b.pending, 0),
    outflow:     brokerStatsAllTime.reduce((a, b) => a + b.outflow, 0),
    brokerCount: brokerStatsAllTime.length,
  };
  const availableYears = Array.from(new Set(brokerTxsAll.map((t) => t.year))).sort((a, b) => b - a);
  if (!availableYears.includes(curYear)) availableYears.unshift(curYear);

  // Per-vehicle repairs are already subtracted inside Vehicle Profit, so
  // exclude vehicleNumber-tagged expenses from "Other Expense" to avoid
  // double-counting. Untagged (general) expenses — rent, utilities — go here.
  const otherExpense  = companyExpensesMonth
    .filter((x) => !x.vehicleNumber)
    .reduce((a, x) => a + x.amount, 0);
  const totalProfit   = vehicleProfit + brokerProfit - otherExpense;

  // --- Year-to-date trend (12 rows, one per month) ---
  const ytd: MonthPoint[] = ytdMonths.map((m) => {
    const ss = ytdSheets.filter((s) => s.month === m.month && s.year === m.year);
    const xs = ytdCompanyExpenses.filter((x) => x.month === m.month && x.year === m.year);
    const bx = brokerExpensesYear.filter((e) => new Date(e.date).getMonth() + 1 === m.month);
    const bt = brokerTxsYear.filter((t) => t.month === m.month);
    // All broker expenses this month (not just company-cab-tagged); they're
    // company income in Yash's model.
    const allBrokerExpThisMonth = brokerExpensesAll.filter((e) => {
      const d = new Date(e.date);
      return d.getFullYear() === m.year && d.getMonth() + 1 === m.month;
    });
    const gross     = ss.reduce((a, s) => a + s.grossEarnings,         0);
    const driverPay = ss.reduce((a, s) => a + s.netDriverPay,          0);
    const gas       = ss.reduce((a, s) => a + s.gasDeduction,          0);
    const extra     = ss.reduce((a, s) => a + s.extraExpenseDeduction, 0);
    // Cab-tagged expenses from BOTH CompanyExpense (category-free) AND BrokerExpense
    // roll into the per-vehicle bucket. Untagged CompanyExpense stays in Other Expense.
    const perVehicleExp = xs.filter((x) => x.vehicleNumber).reduce((a, x) => a + x.amount, 0)
                        + bx.reduce((a, e) => a + e.amount, 0);
    const otherExp      = xs.filter((x) => !x.vehicleNumber).reduce((a, x) => a + x.amount, 0);
    const vehicleP      = gross - driverPay - gas - extra - perVehicleExp;
    const brokerIn      = bt.filter((t) => t.type !== 'PAYOUT').reduce((a, t) => a + t.amount, 0)
                        + allBrokerExpThisMonth.reduce((a, e) => a + e.amount, 0);
    const brokerOut     = bt.filter((t) => t.type === 'PAYOUT').reduce((a, t) => a + t.amount, 0);
    const brokerP       = brokerIn - brokerOut;
    return {
      month: m.month, year: m.year,
      revenue:         gross,
      carExpenses:     gas + extra + perVehicleExp,
      companyExpenses: otherExp,
      brokerProfit:    brokerP,
      companyNet:      vehicleP + brokerP - otherExp,
    };
  });

  // --- Low-priority invoice stats ---
  const todayStr    = new Date().toISOString().split('T')[0];
  const overdueList = allInvoices.filter((i: any) => i.status === 'PENDING' && i.dueDate && i.dueDate < todayStr);
  const stats = {
    total:        allInvoices.reduce((s: number, i: any) => s + i.total, 0),
    paid:         allInvoices.filter((i: any) => i.status === 'PAID').reduce((s: number, i: any) => s + i.total, 0),
    pending:      allInvoices.filter((i: any) => i.status === 'PENDING').reduce((s: number, i: any) => s + i.total, 0),
    draft:        allInvoices.filter((i: any) => i.status === 'DRAFT').reduce((s: number, i: any) => s + i.total, 0),
    overdue:      overdueList.reduce((s: number, i: any) => s + i.total, 0),
    invoiceCount: allInvoices.length,
    overdueCount: overdueList.length,
  };

  return (
    <div className="px-8 py-8 space-y-8">
      <PageHeader title="Dashboard" description={`Company P&L · ${MONTHS[curMonth - 1]} ${curYear}`} action={<DashboardRefresh />} />

      {/* =================================================================
          1. Company P&L — filterable by Month/Year (defaults to current month)
          Vehicle + Broker − Other = Total.
          ================================================================= */}
      <CompanyPLSection
        initialPL={{
          vehicleProfit,
          brokerProfit,
          otherExpense,
          totalProfit,
          brokerCount:  brokerStatsMonth.length,
          vehicleCount: perVehicle.length,
        }}
        initialMonth={curMonth}
        initialYear={curYear}
        availableYears={availableYears}
      />

      {/* =================================================================
          2. Brokers — filterable per-broker cards + aggregate summary
          Default filter: All Time (Yash wanted all-time and/or monthly).
          ================================================================= */}
      <BrokersSection
        initialAggregate={brokerAggregateAllTime}
        initialBrokers={brokerStatsAllTime}
        initialYear={''}
        initialMonth={''}
        availableYears={availableYears}
      />

      {/* =================================================================
          3. Invoices — consolidated summary (moved up from bottom per Yash's
          request: "bring invoice box after broker all time box on dashboard").
          ================================================================= */}
      <section>
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Invoices</h2>
        <InvoiceSummaryCard stats={stats} />
        {investorCarCount > 0 && (
          <p className="mt-4 text-xs text-gray-400">
            Company P&amp;L excludes {investorCarCount} investor car{investorCarCount !== 1 ? 's' : ''} — they&apos;re tracked separately and don&apos;t roll into company profit.
          </p>
        )}
      </section>

      {/* =================================================================
          4. Per-Vehicle breakdown — filterable by Month/Year
          ================================================================= */}
      <PerVehicleSection
        initialPerVehicle={perVehicle}
        initialMonth={curMonth}
        initialYear={curYear}
        availableYears={availableYears}
      />

      {/* =================================================================
          5. Year-to-date — 12-month trend + per-month table
          ================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{curYear} — Year to Date</h2>
          <DashboardPDFButton href={`/api/dashboard/yearly-pdf?year=${curYear}`} />
        </div>
        {companyCabNumbers.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 px-6 py-10 text-center text-sm text-gray-400">
            No company cars yet — nothing to trend.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <RevenueExpenseChart     points={ytd} />
              <ProfitExpenseLineChart  points={ytd} />
            </div>
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Month', 'Revenue', 'Car Expenses', 'Other Expense', 'Broker Profit', 'Total Profit'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ytd.map((p) => {
                    const isCurrent = p.month === curMonth;
                    const isFuture  = p.year > curYear || (p.year === curYear && p.month > curMonth);
                    const profit    = p.companyNet;
                    return (
                      <tr key={`${p.year}-${p.month}`} className={`${isFuture ? 'opacity-40' : ''} ${isCurrent ? 'bg-indigo-50/50' : 'hover:bg-gray-50'}`}>
                        <td className="px-4 py-2.5 font-medium text-gray-900">
                          {MONTHS[p.month - 1]}
                          {isCurrent && <span className="ml-1.5 text-[10px] uppercase tracking-wide text-indigo-600 font-semibold">current</span>}
                        </td>
                        <td className="px-4 py-2.5 text-gray-900 whitespace-nowrap">{formatCurrency(p.revenue)}</td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">−{formatCurrency(p.carExpenses)}</td>
                        <td className="px-4 py-2.5 text-gray-500 whitespace-nowrap">−{formatCurrency(p.companyExpenses)}</td>
                        <td className={`px-4 py-2.5 whitespace-nowrap ${p.brokerProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{p.brokerProfit !== 0 ? `+${formatCurrency(p.brokerProfit)}` : formatCurrency(0)}</td>
                        <td className={`px-4 py-2.5 font-semibold whitespace-nowrap ${profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(profit)}</td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">YTD Total</td>
                    <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{formatCurrency(ytd.reduce((a, p) => a + p.revenue, 0))}</td>
                    <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(ytd.reduce((a, p) => a + p.carExpenses, 0))}</td>
                    <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(ytd.reduce((a, p) => a + p.companyExpenses, 0))}</td>
                    <td className={`px-4 py-3 font-bold whitespace-nowrap ${ytd.reduce((a, p) => a + p.brokerProfit, 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      +{formatCurrency(ytd.reduce((a, p) => a + p.brokerProfit, 0))}
                    </td>
                    <td className={`px-4 py-3 font-bold whitespace-nowrap ${ytd.reduce((a, p) => a + p.companyNet, 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                      {formatCurrency(ytd.reduce((a, p) => a + p.companyNet, 0))}
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          </>
        )}
      </section>

    </div>
  );
}

/** Consolidated Invoice summary. Big Total Invoiced on top, breakdown
 *  (Received / Pending / Drafts / Overdue) in a 4-column footer. Matches
 *  the Broker Profit card style per Yash's ask. */
function InvoiceSummaryCard({ stats }: {
  stats: { total: number; paid: number; pending: number; draft: number; overdue: number; invoiceCount: number; overdueCount: number };
}) {
  return (
    <div className="rounded-2xl p-5 shadow-sm ring-1 ring-gray-200 bg-white">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Total Invoiced</p>
      <p className="mt-2 text-3xl font-bold text-gray-900">{formatCurrency(stats.total)}</p>
      <p className="mt-1 text-xs text-gray-500">{stats.invoiceCount} invoice{stats.invoiceCount !== 1 ? 's' : ''}</p>
      <div className="mt-3 grid grid-cols-2 md:grid-cols-4 gap-2 border-t border-gray-100 pt-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Received</p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-600">{formatCurrency(stats.paid)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">Pending</p>
          <p className="mt-0.5 text-sm font-semibold text-amber-600">{formatCurrency(stats.pending)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-slate-400">Drafts</p>
          <p className="mt-0.5 text-sm font-semibold text-slate-500">{formatCurrency(stats.draft)}</p>
        </div>
        <div>
          <p className={`text-[10px] font-semibold uppercase tracking-wide ${stats.overdueCount > 0 ? 'text-red-500' : 'text-slate-400'}`}>Overdue</p>
          <p className={`mt-0.5 text-sm font-semibold ${stats.overdueCount > 0 ? 'text-red-600' : 'text-slate-400'}`}>
            {stats.overdueCount > 0 ? formatCurrency(stats.overdue) : '—'}
          </p>
          {stats.overdueCount > 0 && (
            <p className="text-[10px] text-red-500 mt-0.5">{stats.overdueCount} past due</p>
          )}
        </div>
      </div>
    </div>
  );
}

