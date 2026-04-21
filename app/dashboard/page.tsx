import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';
import PageHeader from '@/components/ui/PageHeader';
import DashboardRefresh from '@/components/dashboard/DashboardRefresh';
import { RevenueExpenseChart, NetProfitLineChart, type MonthPoint } from '@/components/dashboard/DashboardCharts';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

/**
 * Dashboard layout priority (top → bottom), per Yash's spec:
 *   1. Company P&L (current month): Vehicle + Broker − Other Expense = Total
 *   2. Per-Vehicle profit row for every company cab (current month)
 *   3. Year-to-date trend (12 months of revenue / expenses / profit)
 *   4. Low-priority: invoice summary, Companies/Rides links
 *
 * Formulas are a rough first draft — will be refined with Yash:
 *   - Vehicle Profit = Σ(gross) − Σ(driver 40%) − Σ(gas) − Σ(call) − Σ(extra)
 *     (debit fee is ignored for now per Yash's description; will add back later if wanted)
 *   - Broker Profit  = Σ(broker transactions PAID+PENDING, excluding PAYOUT)
 *     − Σ(PAYOUT transactions). Stand rent includes company-subleased
 *     vehicles today — flagged on the card; pending fix from Yash.
 *   - Other Expense  = Σ(CompanyExpense for month)
 *   - Cab Repairs    = not tracked yet. Shown as "—" until Yash confirms source.
 */
export default async function DashboardPage() {
  const now      = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();

  // --- Phase 1: things we need to know before querying by vehicleNumber ---
  const [companyCars, investorCarCount, allInvoices, companiesCount, ridesCount] = await Promise.all([
    prisma.brokerVehicle.findMany({ where: { isCompanyCar: true }, select: { cabNumber: true } }).catch(() => [] as { cabNumber: string }[]),
    prisma.brokerVehicle.count({ where: { isCompanyCar: false, isActive: true } }).catch(() => 0),
    prisma.invoice.findMany({ orderBy: { createdAt: 'desc' } }).catch(() => [] as any[]),
    prisma.company.count().catch(() => 0),
    prisma.ride.count().catch(() => 0),
  ]);
  const companyCabNumbers = companyCars.map((v) => v.cabNumber);

  // --- Phase 2: everything else in parallel ---
  // For the yearly trend, pull every month of the current year (Jan → Dec).
  const ytdMonths: { month: number; year: number }[] = Array.from({ length: 12 }, (_, i) => ({ month: i + 1, year: curYear }));

  const [ytdSheets, ytdCompanyExpenses, brokerTxsMonth, companyExpensesMonth, curSheets] = await Promise.all([
    companyCabNumbers.length > 0
      ? prisma.dailySheet.findMany({
          where: { vehicleNumber: { in: companyCabNumbers }, year: curYear },
          select: {
            month: true, year: true, vehicleNumber: true,
            grossEarnings: true, netDriverPay: true, companyNet: true,
            gasDeduction: true, callChargeDeduction: true, extraExpenseDeduction: true,
          },
        })
      : Promise.resolve([] as any[]),
    prisma.companyExpense.findMany({
      where: { year: curYear },
      select: { month: true, year: true, amount: true },
    }).catch(() => [] as { month: number; year: number; amount: number }[]),
    prisma.brokerTransaction.findMany({
      where: { month: curMonth, year: curYear, status: { not: 'VOID' } },
      select: { amount: true, type: true },
    }).catch(() => [] as { amount: number; type: string }[]),
    prisma.companyExpense.findMany({
      where: { month: curMonth, year: curYear },
      select: { amount: true },
    }).catch(() => [] as { amount: number }[]),
    companyCabNumbers.length > 0
      ? prisma.dailySheet.findMany({
          where: { vehicleNumber: { in: companyCabNumbers }, month: curMonth, year: curYear },
          select: {
            vehicleNumber: true, grossEarnings: true, netDriverPay: true,
            gasDeduction: true, callChargeDeduction: true, extraExpenseDeduction: true,
          },
        })
      : Promise.resolve([] as any[]),
  ]);

  // --- Current-month per-vehicle stats ---
  interface VehicleStats {
    cabNumber:  string;
    gross:      number;
    driverPay:  number; // 40%
    gas:        number;
    call:       number;
    extra:      number;
    repairs:    number; // placeholder — not tracked yet
    profit:     number; // gross − driverPay − gas − call − extra − repairs
  }
  const perVehicle: VehicleStats[] = companyCabNumbers.map((cab) => {
    const sheets = curSheets.filter((s) => s.vehicleNumber === cab);
    const gross     = sheets.reduce((a, s) => a + s.grossEarnings,         0);
    const driverPay = sheets.reduce((a, s) => a + s.netDriverPay,          0);
    const gas       = sheets.reduce((a, s) => a + s.gasDeduction,          0);
    const call      = sheets.reduce((a, s) => a + s.callChargeDeduction,   0);
    const extra     = sheets.reduce((a, s) => a + s.extraExpenseDeduction, 0);
    const repairs   = 0;
    return {
      cabNumber: cab,
      gross, driverPay, gas, call, extra, repairs,
      profit: gross - driverPay - gas - call - extra - repairs,
    };
  }).sort((a, b) => b.profit - a.profit);

  // --- Company P&L block (current month) ---
  const vehicleProfit = perVehicle.reduce((a, v) => a + v.profit, 0);

  const brokerInflow  = brokerTxsMonth.filter((t) => t.type !== 'PAYOUT').reduce((a, t) => a + t.amount, 0);
  const brokerOutflow = brokerTxsMonth.filter((t) => t.type === 'PAYOUT').reduce((a, t) => a + t.amount, 0);
  const brokerProfit  = brokerInflow - brokerOutflow;

  const otherExpense  = companyExpensesMonth.reduce((a, x) => a + x.amount, 0);
  const totalProfit   = vehicleProfit + brokerProfit - otherExpense;

  // --- Year-to-date trend (12 rows, one per month) ---
  const ytd: MonthPoint[] = ytdMonths.map((m) => {
    const ss = ytdSheets.filter((s) => s.month === m.month && s.year === m.year);
    const xs = ytdCompanyExpenses.filter((x) => x.month === m.month && x.year === m.year);
    const gross     = ss.reduce((a, s) => a + s.grossEarnings,         0);
    const driverPay = ss.reduce((a, s) => a + s.netDriverPay,          0);
    const gas       = ss.reduce((a, s) => a + s.gasDeduction,          0);
    const call      = ss.reduce((a, s) => a + s.callChargeDeduction,   0);
    const extra     = ss.reduce((a, s) => a + s.extraExpenseDeduction, 0);
    const companyExp = xs.reduce((a, x) => a + x.amount, 0);
    const vehicleP  = gross - driverPay - gas - call - extra;
    return {
      month: m.month, year: m.year,
      revenue:         gross,
      carExpenses:     gas + call + extra,
      companyExpenses: companyExp,
      companyNet:      vehicleP - companyExp,
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
            sub={
              brokerOutflow > 0
                ? `in ${formatCurrency(brokerInflow)} − out ${formatCurrency(brokerOutflow)}`
                : `billed (paid + pending)`
            }
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
          2. Per-Vehicle breakdown (current month)
          ================================================================= */}
      <section>
        <div className="flex items-center justify-between mb-3">
          <h2 className="text-sm font-semibold text-gray-900">Per-Vehicle Profit — {MONTHS[curMonth - 1]} {curYear}</h2>
          <Link href="/daily-sheets" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">View sheets →</Link>
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
                  {['Cab #', 'Gross', 'Driver 40%', 'Gas', 'Call', 'Extra', 'Repairs', 'Profit'].map((h) => (
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
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">−{formatCurrency(v.call)}</td>
                    <td className="px-4 py-3 text-gray-500 whitespace-nowrap">−{formatCurrency(v.extra)}</td>
                    <td className="px-4 py-3 text-gray-300 whitespace-nowrap" title="Cab repairs not tracked yet">—</td>
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
                  <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(perVehicle.reduce((a, v) => a + v.call,      0))}</td>
                  <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(perVehicle.reduce((a, v) => a + v.extra,     0))}</td>
                  <td className="px-4 py-3 font-semibold text-gray-300 whitespace-nowrap">—</td>
                  <td className={`px-4 py-3 font-bold whitespace-nowrap ${vehicleProfit >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>{formatCurrency(vehicleProfit)}</td>
                </tr>
              </tfoot>
            </table>
          </div>
        )}
        <p className="mt-2 text-xs text-gray-400">
          <strong>Repairs</strong> column is a placeholder — not tracked yet. Tell me where this data should live (new daily-sheet field or vehicle-tagged Company Expense) and I&apos;ll wire it in.
        </p>
      </section>

      {/* =================================================================
          3. Year-to-date — 12-month trend + per-month table
          ================================================================= */}
      <section className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-sm font-semibold text-gray-900">{curYear} — Year to Date</h2>
        </div>
        {companyCabNumbers.length === 0 ? (
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 px-6 py-10 text-center text-sm text-gray-400">
            No company cars yet — nothing to trend.
          </div>
        ) : (
          <>
            <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
              <RevenueExpenseChart points={ytd} />
              <NetProfitLineChart   points={ytd} />
            </div>
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <table className="w-full text-sm">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Month', 'Revenue', 'Car Expenses', 'Other Expense', 'Total Profit'].map((h) => (
                      <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {ytd.map((p) => {
                    const isCurrent = p.month === curMonth;
                    const isFuture  = p.year > curYear || (p.year === curYear && p.month > curMonth);
                    const totalExp  = p.carExpenses + p.companyExpenses;
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
          4. Low-priority — invoice summary + Companies / Rides
          Yash: "this data we can see inside so that not priority".
          ================================================================= */}
      <section className="pt-4 border-t border-gray-100">
        <h2 className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-3">Invoices &amp; directory</h2>
        <div className="grid grid-cols-2 gap-4 lg:grid-cols-5 mb-4">
          {[
            { label: 'Total Invoiced', value: stats.total,   sub: `${stats.invoiceCount} invoice${stats.invoiceCount !== 1 ? 's' : ''}`, valueColor: 'text-gray-900' },
            { label: 'Received',       value: stats.paid,    sub: null,                                                                    valueColor: 'text-emerald-600' },
            { label: 'Pending',        value: stats.pending, sub: null,                                                                    valueColor: 'text-amber-600' },
            { label: 'Drafts',         value: stats.draft,   sub: null,                                                                    valueColor: 'text-slate-500' },
          ].map((card) => (
            <div key={card.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{card.label}</p>
              <p className={`mt-2 text-2xl font-bold ${card.valueColor}`}>{formatCurrency(card.value)}</p>
              {card.sub && <p className="mt-1 text-xs text-gray-500">{card.sub}</p>}
            </div>
          ))}
          <div className={`rounded-2xl p-5 shadow-sm ring-1 ${stats.overdueCount > 0 ? 'bg-red-50 ring-red-200' : 'bg-white ring-gray-200'}`}>
            <p className={`text-xs font-semibold uppercase tracking-widest ${stats.overdueCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>Overdue</p>
            <p className={`mt-2 text-2xl font-bold ${stats.overdueCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
              {stats.overdueCount > 0 ? formatCurrency(stats.overdue) : '—'}
            </p>
            {stats.overdueCount > 0 && (
              <p className="mt-1 text-xs text-red-500">{stats.overdueCount} invoice{stats.overdueCount !== 1 ? 's' : ''} past due</p>
            )}
          </div>
        </div>

        <div className="grid grid-cols-2 gap-4">
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-indigo-50">
              <svg className="h-6 w-6 text-indigo-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{companiesCount}</p>
              <p className="text-sm text-gray-500">Companies</p>
            </div>
            <Link href="/companies" className="ml-auto text-sm font-medium text-indigo-600 hover:text-indigo-700">View →</Link>
          </div>
          <div className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200 flex items-center gap-4">
            <div className="flex h-12 w-12 items-center justify-center rounded-xl bg-emerald-50">
              <svg className="h-6 w-6 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M8 7h12m0 0l-4-4m4 4l-4 4m0 6H4m0 0l4 4m-4-4l4-4" />
              </svg>
            </div>
            <div>
              <p className="text-2xl font-bold text-gray-900">{ridesCount}</p>
              <p className="text-sm text-gray-500">Total Rides</p>
            </div>
            <Link href="/rides" className="ml-auto text-sm font-medium text-indigo-600 hover:text-indigo-700">View →</Link>
          </div>
        </div>

        {investorCarCount > 0 && (
          <p className="mt-4 text-xs text-gray-400">
            Company P&amp;L excludes {investorCarCount} investor car{investorCarCount !== 1 ? 's' : ''} — they&apos;re tracked separately and don&apos;t roll into company profit.
          </p>
        )}
      </section>

    </div>
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
