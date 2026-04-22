import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';
import PageHeader from '@/components/ui/PageHeader';
import DashboardRefresh from '@/components/dashboard/DashboardRefresh';
import { RevenueExpenseChart, ProfitExpenseLineChart, ExpenseBreakdownChart, type MonthPoint } from '@/components/dashboard/DashboardCharts';
import DashboardPDFButton from '@/components/dashboard/DashboardPDFButton';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * Dashboard layout priority (top → bottom), per Yash's spec:
 *   1. Company P&L (current month): Vehicle + Broker − Other Expense = Total
 *   2. Per-Vehicle profit row for every company cab (current month)
 *   3. Year-to-date trend (12 months of revenue / expenses / profit)
 *   4. Low-priority: invoice summary, Companies/Rides links
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

  const [ytdSheets, ytdCompanyExpenses, brokerTxsYear, companyExpensesMonth, curSheets, curRepairs] = await Promise.all([
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
    prisma.brokerTransaction.findMany({
      where:   { year: curYear, status: { not: 'VOID' } },
      select:  { amount: true, type: true, status: true, month: true, brokerId: true, broker: { select: { id: true, name: true } } },
      orderBy: [{ brokerId: 'asc' }, { createdAt: 'asc' }],
    }).catch(() => [] as { amount: number; type: string; status: string; month: number; brokerId: string; broker: { id: string; name: string } }[]),
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

  // Broker expenses tagged to a company cab also count as per-vehicle expenses.
  // BrokerExpense is keyed by date (not month/year), so filter in memory after
  // fetching the full-year slice for any company cab.
  const yearStart = new Date(curYear, 0, 1);
  const yearEnd   = new Date(curYear + 1, 0, 1);
  const brokerExpensesYear = companyCabNumbers.length > 0
    ? await prisma.brokerExpense.findMany({
        where: {
          cabNumber: { in: companyCabNumbers },
          date:      { gte: yearStart, lt: yearEnd },
        },
        select: { cabNumber: true, amount: true, date: true },
      }).catch(() => [] as { cabNumber: string; amount: number; date: Date }[])
    : [];
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

  // Current-month broker transactions, grouped per broker for the per-broker
  // card grid. Each card shows: Name (big), Total we own (big), Paid/Pending
  // (small footer). Aggregate broker profit is the sum of every card's total.
  const brokerTxsMonth = brokerTxsYear.filter((t) => t.month === curMonth);

  interface BrokerStat {
    id: string; name: string;
    total: number;       // net owed this month (inflow − outflow)
    paid: number;        // paid-status inflow
    pending: number;     // non-paid inflow
    outflow: number;     // PAYOUT amounts
  }
  const brokerStatsMap = new Map<string, BrokerStat>();
  for (const t of brokerTxsMonth) {
    const cur = brokerStatsMap.get(t.brokerId) ?? {
      id: t.brokerId, name: t.broker.name,
      total: 0, paid: 0, pending: 0, outflow: 0,
    };
    if (t.type === 'PAYOUT') {
      cur.outflow += t.amount;
      cur.total   -= t.amount;
    } else {
      if (t.status === 'PAID') cur.paid    += t.amount;
      else                     cur.pending += t.amount;
      cur.total += t.amount;
    }
    brokerStatsMap.set(t.brokerId, cur);
  }
  const brokerStats: BrokerStat[] = Array.from(brokerStatsMap.values()).sort((a, b) => b.total - a.total);
  const brokerProfit = brokerStats.reduce((a, b) => a + b.total, 0);

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
    const brokerIn      = bt.filter((t) => t.type !== 'PAYOUT').reduce((a, t) => a + t.amount, 0);
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
          1. Company P&L — current month
          Vehicle + Broker − Other = Total.
          ================================================================= */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Company P&amp;L — {MONTHS[curMonth - 1]} {curYear}</h2>
          <p className="text-xs text-gray-400">Rough first draft · numbers still being refined</p>
        </div>
        <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
          <BigStat
            label="Vehicle Profit"
            value={vehicleProfit}
            sub={`${perVehicle.length} company cab${perVehicle.length !== 1 ? 's' : ''}`}
            tone={vehicleProfit >= 0 ? 'positive' : 'negative'}
          />
          <BigStat
            label="Broker Profit"
            value={brokerProfit}
            sub={`${brokerStats.length} broker${brokerStats.length !== 1 ? 's' : ''} — see below`}
            tone={brokerProfit >= 0 ? 'positive' : 'negative'}
          />
          <BigStat
            label="Other Expense"
            value={-otherExpense}
            sub="from Company Expenses"
            tone={otherExpense > 0 ? 'muted-negative' : 'muted'}
          />
          <BigStat
            label="Total Profit"
            value={totalProfit}
            sub="Vehicle + Broker − Other"
            tone={totalProfit >= 0 ? 'positive-strong' : 'negative-strong'}
          />
        </div>
      </section>

      {/* =================================================================
          1b. Brokers — per-broker cards (Name, Total owed, Paid + Pending)
          ================================================================= */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Brokers — {MONTHS[curMonth - 1]} {curYear}</h2>
          <Link href="/brokers" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">All brokers →</Link>
        </div>
        {brokerStats.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 px-6 py-10 text-center text-sm text-gray-400">
            No broker billing for {MONTHS[curMonth - 1]} yet.
          </div>
        ) : (
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
            {brokerStats.map((b) => (
              <BrokerCard key={b.id} stat={b} />
            ))}
          </div>
        )}
      </section>

      {/* =================================================================
          2. Per-Vehicle breakdown (current month)
          ================================================================= */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Per-Vehicle Profit — {MONTHS[curMonth - 1]} {curYear}</h2>
          <DashboardPDFButton href={`/api/dashboard/per-vehicle-pdf?month=${curMonth}&year=${curYear}`} />
        </div>
        {perVehicle.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 px-6 py-10 text-center text-sm text-gray-400">
            No company-owned cabs yet. <Link href="/vehicles" className="text-indigo-600 hover:text-indigo-700">Mark a car as Company</Link> to include it here.
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Cab #', 'Gross', 'Driver 40%', 'Gas', 'Extra', 'Other', 'Profit'].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {perVehicle.map((v) => (
                  <tr key={v.cabNumber} className="hover:bg-gray-50">
                    <td className="px-4 py-3 font-mono font-semibold text-gray-900">#{v.cabNumber}</td>
                    <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{formatCurrency(v.gross)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">−{formatCurrency(v.driverPay)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">−{formatCurrency(v.gas)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">−{formatCurrency(v.extra)}</td>
                    <td className={`px-4 py-3 whitespace-nowrap ${v.repairs > 0 ? 'text-gray-500' : 'text-gray-300'}`} title="Sum of every expense tagged with this cab # — from Company Expenses AND Broker Expenses">
                      {v.repairs > 0 ? `−${formatCurrency(v.repairs)}` : '—'}
                    </td>
                    <td className={`px-4 py-3 font-semibold whitespace-nowrap ${v.profit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(v.profit)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Totals</td>
                  <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{formatCurrency(perVehicle.reduce((a, v) => a + v.gross,     0))}</td>
                  <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(perVehicle.reduce((a, v) => a + v.driverPay, 0))}</td>
                  <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(perVehicle.reduce((a, v) => a + v.gas,       0))}</td>
                  <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(perVehicle.reduce((a, v) => a + v.extra,     0))}</td>
                  <td className={`px-4 py-3 font-semibold whitespace-nowrap ${perVehicle.reduce((a, v) => a + v.repairs, 0) > 0 ? 'text-gray-500' : 'text-gray-300'}`}>
                    {perVehicle.reduce((a, v) => a + v.repairs, 0) > 0
                      ? `−${formatCurrency(perVehicle.reduce((a, v) => a + v.repairs, 0))}`
                      : '—'}
                  </td>
                  <td className={`px-4 py-3 font-bold whitespace-nowrap ${vehicleProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(vehicleProfit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          <strong>Other</strong> column sums every expense tagged with the cab # — from <Link href="/company-expenses" className="underline hover:text-gray-600">Company Expenses</Link> (repairs, maintenance) and <Link href="/expenses" className="underline hover:text-gray-600">Broker Expenses</Link> (anything the broker took from that cab&apos;s earnings).
        </p>

        {/* Per-vehicle pie charts: where each cab's gross went this month */}
        {perVehicle.length > 0 && (
          <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
            {perVehicle.map((v) => {
              const slices = [
                { label: 'Driver 40%', value: v.driverPay, color: '#64748B' },
                { label: 'Gas',        value: v.gas,       color: '#4F46E5' },
                { label: 'Extra',      value: v.extra,     color: '#F59E0B' },
                { label: 'Other',      value: v.repairs,   color: '#EF4444' },
                { label: 'Profit',     value: Math.max(v.profit, 0), color: '#10B981' },
              ];
              const sub = v.profit >= 0
                ? `Gross ${formatCurrency(v.gross)} · Profit ${formatCurrency(v.profit)}`
                : `Gross ${formatCurrency(v.gross)} · Loss ${formatCurrency(v.profit)}`;
              return (
                <ExpenseBreakdownChart
                  key={v.cabNumber}
                  title={`Cab #${v.cabNumber}`}
                  sub={sub}
                  slices={slices}
                />
              );
            })}
          </div>
        )}
      </section>

      {/* =================================================================
          3. Year-to-date — 12-month trend + per-month table
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

      {/* =================================================================
          4. Low-priority — consolidated invoice summary
          Yash: "this data we can see inside so that not priority"
          + "i need this same as broker profit like total is big and rest
             of all down" → single card, big total + breakdown underneath.
          ================================================================= */}
      <section className="pt-4 border-t border-gray-100">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Invoices</h2>
        <InvoiceSummaryCard stats={stats} />

        {investorCarCount > 0 && (
          <p className="mt-4 text-xs text-gray-400">
            Company P&amp;L excludes {investorCarCount} investor car{investorCarCount !== 1 ? 's' : ''} — they&apos;re tracked separately and don&apos;t roll into company profit.
          </p>
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

/** Per-broker summary card. Broker name on top, total owed in big type, then
 *  Paid / Pending as a smaller footer pair. Grid of these replaces the single
 *  aggregate Broker Profit card per Yash's design ask. */
function BrokerCard({ stat }: {
  stat: { id: string; name: string; total: number; paid: number; pending: number; outflow: number };
}) {
  const tone = stat.total >= 0 ? 'text-emerald-600' : 'text-red-600';
  return (
    <Link
      href={`/brokers/${stat.id}`}
      className="group rounded-2xl p-5 shadow-sm ring-1 ring-gray-200 bg-white hover:ring-indigo-200 hover:shadow-md transition-shadow"
    >
      <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-700" title={stat.name}>{stat.name}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{formatCurrency(stat.total)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Paid</p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-600">{formatCurrency(stat.paid)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">Pending</p>
          <p className="mt-0.5 text-sm font-semibold text-amber-600">{formatCurrency(stat.pending)}</p>
        </div>
      </div>
      {stat.outflow > 0 && (
        <p className="mt-2 text-xs text-gray-400">− {formatCurrency(stat.outflow)} paid out</p>
      )}
    </Link>
  );
}

/** Big stat card for the top-row P&L block. */
function BigStat({ label, value, sub, tone }: {
  label: string;
  value: number;
  sub?:  string;
  tone:  'positive' | 'positive-strong' | 'negative' | 'negative-strong' | 'muted' | 'muted-negative';
}) {
  const color =
    tone === 'positive-strong' ? 'text-emerald-700' :
    tone === 'negative-strong' ? 'text-red-700'     :
    tone === 'positive'        ? 'text-emerald-600' :
    tone === 'negative'        ? 'text-red-600'     :
    tone === 'muted-negative'  ? 'text-amber-600'   :
                                 'text-gray-500';
  const ring =
    tone === 'positive-strong' ? 'ring-emerald-200 bg-emerald-50' :
    tone === 'negative-strong' ? 'ring-red-200 bg-red-50'         :
                                 'ring-gray-200 bg-white';
  return (
    <div className={`rounded-2xl p-5 shadow-sm ring-1 ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{formatCurrency(value)}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
