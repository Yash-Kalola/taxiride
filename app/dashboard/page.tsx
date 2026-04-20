import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';
import PageHeader from '@/components/ui/PageHeader';
import DashboardRefresh from '@/components/dashboard/DashboardRefresh';
import {
  RevenueExpenseChart,
  NetProfitLineChart,
  ExpenseBreakdownChart,
  type MonthPoint,
} from '@/components/dashboard/DashboardCharts';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let stats = { total: 0, paid: 0, pending: 0, draft: 0, overdue: 0, invoiceCount: 0, overdueCount: 0 };
  let recentInvoices: any[] = [];
  let companiesCount = 0;
  let ridesCount = 0;
  let dbConnected = true;

  // Company-vehicle P&L for the current month.
  // IMPORTANT: investor/broker cars are intentionally EXCLUDED from this
  // aggregation — we only track their daily sheets for record-keeping, not
  // for the company's profit/loss. The `isCompanyCar: true` filter is what
  // draws that line.
  const now = new Date();
  const curMonth = now.getMonth() + 1;
  const curYear  = now.getFullYear();
  let pnl = {
    gross: 0, driverPay: 0, companyShare: 0,
    gas: 0, call: 0, extra: 0, expenses: 0, companyNet: 0,
    sheetCount: 0, carCount: 0, investorCount: 0,
  };
  // Running totals for the current month's own overhead (Rent, Utilities, etc.)
  let companyExpensesThisMonth = 0;
  // 6-month trend (including current) for the dashboard charts
  let trend: MonthPoint[] = [];

  try {
    const [allInvoices, companies, rides, companyCars, investorCarCount] = await Promise.all([
      prisma.invoice.findMany({ include: { company: { select: { companyName: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.company.count(),
      prisma.ride.count(),
      prisma.brokerVehicle.findMany({ where: { isCompanyCar: true },  select: { cabNumber: true } }),
      prisma.brokerVehicle.count({    where: { isCompanyCar: false, isActive: true } }),
    ]);
    recentInvoices = allInvoices.slice(0, 5);
    companiesCount = companies;
    ridesCount = rides;

    const todayStr      = new Date().toISOString().split('T')[0];
    const overdueList   = allInvoices.filter((i) => i.status === 'PENDING' && i.dueDate && i.dueDate < todayStr);

    stats = {
      total:        allInvoices.reduce((s, i) => s + i.total, 0),
      paid:         allInvoices.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.total, 0),
      pending:      allInvoices.filter((i) => i.status === 'PENDING').reduce((s, i) => s + i.total, 0),
      draft:        allInvoices.filter((i) => i.status === 'DRAFT').reduce((s, i) => s + i.total, 0),
      overdue:      overdueList.reduce((s, i) => s + i.total, 0),
      invoiceCount: allInvoices.length,
      overdueCount: overdueList.length,
    };

    // P&L: aggregate daily sheets for company-owned cabs only
    const companyCabNumbers = companyCars.map((v) => v.cabNumber);
    pnl.carCount      = companyCabNumbers.length;
    pnl.investorCount = investorCarCount;

    // Build the 6-month trend in one pass. Goes back 5 months + includes current.
    const months: { month: number; year: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = new Date(curYear, curMonth - 1 - i, 1);
      months.push({ month: d.getMonth() + 1, year: d.getFullYear() });
    }
    const earliest = months[0];
    const latest   = months[months.length - 1];

    const [trendSheets, trendExpenses] = await Promise.all([
      companyCabNumbers.length > 0
        ? prisma.dailySheet.findMany({
            where: {
              vehicleNumber: { in: companyCabNumbers },
              OR: months.map((m) => ({ month: m.month, year: m.year })),
            },
            select: {
              month: true, year: true,
              grossEarnings: true, netDriverPay: true,
              gasDeduction: true, callChargeDeduction: true, extraExpenseDeduction: true,
              companyNet: true,
            },
          })
        : Promise.resolve([] as any[]),
      prisma.companyExpense.findMany({
        where: {
          OR: months.map((m) => ({ month: m.month, year: m.year })),
        },
        select: { month: true, year: true, amount: true },
      }).catch(() => [] as { month: number; year: number; amount: number }[]),
    ]);

    trend = months.map((m) => {
      const ss = trendSheets.filter((s) => s.month === m.month && s.year === m.year);
      const xs = trendExpenses.filter((x) => x.month === m.month && x.year === m.year);
      return {
        month:   m.month,
        year:    m.year,
        revenue: ss.reduce((a, s) => a + s.grossEarnings, 0),
        carExpenses: ss.reduce((a, s) =>
          a + s.gasDeduction + s.callChargeDeduction + s.extraExpenseDeduction, 0),
        companyExpenses: xs.reduce((a, x) => a + x.amount, 0),
        companyNet: ss.reduce((a, s) => a + s.companyNet, 0)
                  - xs.reduce((a, x) => a + x.amount, 0),
      };
    });

    // Hydrate the existing monthly P&L from the trend slice for the current month
    const cur = trend[trend.length - 1];
    pnl.sheetCount = trendSheets.filter((s) => s.month === latest.month && s.year === latest.year).length;
    const curSheets = trendSheets.filter((s) => s.month === latest.month && s.year === latest.year);
    pnl.gross       = curSheets.reduce((a, s) => a + s.grossEarnings,         0);
    pnl.driverPay   = curSheets.reduce((a, s) => a + s.netDriverPay,          0);
    pnl.gas         = curSheets.reduce((a, s) => a + s.gasDeduction,          0);
    pnl.call        = curSheets.reduce((a, s) => a + s.callChargeDeduction,   0);
    pnl.extra       = curSheets.reduce((a, s) => a + s.extraExpenseDeduction, 0);
    pnl.companyNet  = curSheets.reduce((a, s) => a + s.companyNet,            0);
    pnl.expenses    = pnl.gas + pnl.call + pnl.extra;
    pnl.companyShare = pnl.companyNet + pnl.expenses;
    companyExpensesThisMonth = cur ? cur.companyExpenses : 0;
    void earliest; // kept for potential future range-label use
  } catch {
    dbConnected = false;
  }

  return (
    <div className="px-8 py-8 space-y-8">
      <PageHeader title="Dashboard" description="Overview of your invoice activity" action={<DashboardRefresh />} />

      {!dbConnected && (
        <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 text-sm text-amber-800">
          <strong>Database not connected.</strong> Add <code className="font-mono bg-amber-100 px-1 rounded">DATABASE_URL</code> to <code className="font-mono bg-amber-100 px-1 rounded">.env.local</code> and run <code className="font-mono bg-amber-100 px-1 rounded">npx prisma migrate dev</code>.
        </div>
      )}

      {/* Summary cards */}
      <div className="grid grid-cols-2 gap-4 lg:grid-cols-5">
        {[
          { label: 'Total Invoiced', value: stats.total,   sub: `${stats.invoiceCount} invoice${stats.invoiceCount !== 1 ? 's' : ''}`, valueColor: 'text-gray-900' },
          { label: 'Received',       value: stats.paid,    sub: null,                                                                    valueColor: 'text-emerald-600' },
          { label: 'Pending',        value: stats.pending, sub: null,                                                                    valueColor: 'text-amber-600' },
          { label: 'Drafts',         value: stats.draft,   sub: null,                                                                    valueColor: 'text-slate-500' },
        ].map((card) => (
          <div key={card.label} className="rounded-2xl bg-white p-5 shadow-sm ring-1 ring-gray-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{card.label}</p>
            <p className={`mt-2 text-3xl font-bold ${card.valueColor}`}>{formatCurrency(card.value)}</p>
            {card.sub && <p className="mt-1 text-xs text-gray-500">{card.sub}</p>}
          </div>
        ))}
        {/* Overdue card — always visible, highlights red when overdue invoices exist */}
        <div className={`rounded-2xl p-5 shadow-sm ring-1 ${stats.overdueCount > 0 ? 'bg-red-50 ring-red-200' : 'bg-white ring-gray-200'}`}>
          <p className={`text-xs font-semibold uppercase tracking-widest ${stats.overdueCount > 0 ? 'text-red-400' : 'text-gray-400'}`}>Overdue</p>
          <p className={`mt-2 text-3xl font-bold ${stats.overdueCount > 0 ? 'text-red-600' : 'text-gray-400'}`}>
            {stats.overdueCount > 0 ? formatCurrency(stats.overdue) : '—'}
          </p>
          {stats.overdueCount > 0 && (
            <p className="mt-1 text-xs text-red-500">{stats.overdueCount} invoice{stats.overdueCount !== 1 ? 's' : ''} past due</p>
          )}
        </div>
      </div>

      {/* Quick stats row */}
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

      {/* Company Vehicle P&L — current month, company-owned cabs ONLY.
          Investor/broker cars are intentionally excluded — their daily sheets
          are kept for record-keeping only, not counted in the company's P&L.
          A car's type is set on the Vehicles page ("Company Car" vs "Broker Car"). */}
      {(pnl.carCount > 0 || pnl.investorCount > 0) && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <div>
              <h2 className="text-sm font-semibold text-gray-900">Company Vehicle P&amp;L</h2>
              <p className="mt-0.5 text-xs text-gray-500">
                {MONTHS[curMonth - 1]} {curYear} · {pnl.carCount} company cab{pnl.carCount !== 1 ? 's' : ''} · {pnl.sheetCount} shift{pnl.sheetCount !== 1 ? 's' : ''}
                {pnl.investorCount > 0 && (
                  <span className="ml-1 text-gray-400">
                    · {pnl.investorCount} investor car{pnl.investorCount !== 1 ? 's' : ''} excluded
                  </span>
                )}
              </p>
            </div>
            <Link href="/daily-sheets" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">View sheets →</Link>
          </div>

          {pnl.carCount === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No company-owned cabs yet. <Link href="/vehicles" className="text-indigo-600 hover:text-indigo-700">Mark a car as Company</Link> to include its shifts in P&amp;L.
            </div>
          ) : pnl.sheetCount === 0 ? (
            <div className="px-6 py-10 text-center text-sm text-gray-400">
              No daily sheets yet for company cabs this month.
            </div>
          ) : (
            <>
              <div className="grid grid-cols-2 md:grid-cols-4 gap-4 p-6">
                <PnlCard label="Total Gross"           value={pnl.gross}        tone="neutral" />
                <PnlCard label="Driver Share (40%)"    value={pnl.driverPay}    tone="muted"
                  sub="reference — not the driver pay" />
                <PnlCard label="Company Share (60%)"   value={pnl.companyShare} tone="muted"
                  sub="after debit fees" />
                <PnlCard
                  label="Driver Pay / Company Net"
                  value={pnl.companyNet}
                  tone={pnl.companyNet >= 0 ? 'positive' : 'negative'}
                  sub="= 60% − debit − gas − call − extra"
                />
              </div>

              {pnl.expenses > 0 && (
                <div className="border-t border-gray-100 bg-gray-50 px-6 py-3 text-xs text-gray-500 flex flex-wrap gap-x-6 gap-y-1">
                  <span className="uppercase tracking-wide font-semibold text-gray-400">Company expenses:</span>
                  <span>Gas <span className="font-medium text-gray-700">{formatCurrency(pnl.gas)}</span></span>
                  <span>Call <span className="font-medium text-gray-700">{formatCurrency(pnl.call)}</span></span>
                  <span>Extra <span className="font-medium text-gray-700">{formatCurrency(pnl.extra)}</span></span>
                  <span className="ml-auto">Total <span className="font-semibold text-amber-700">−{formatCurrency(pnl.expenses)}</span></span>
                </div>
              )}
            </>
          )}
        </div>
      )}

      {/* Charts — revenue/expense trend + breakdowns (current month).
          Built on aggregates we already fetched for the P&L card, so no extra round-trip. */}
      {dbConnected && pnl.carCount > 0 && (
        <>
          <div className="grid grid-cols-1 xl:grid-cols-2 gap-6">
            <RevenueExpenseChart points={trend} />
            <NetProfitLineChart points={trend} />
          </div>

          <div className="grid grid-cols-1 md:grid-cols-2 gap-6">
            <ExpenseBreakdownChart
              title="Car Expenses (this month)"
              sub={`${MONTHS[curMonth - 1]} ${curYear} · from daily sheets`}
              slices={[
                { label: 'Gas',   value: pnl.gas,   color: '#4F46E5' },
                { label: 'Call',  value: pnl.call,  color: '#06B6D4' },
                { label: 'Extra', value: pnl.extra, color: '#F59E0B' },
              ]}
            />
            <ExpenseBreakdownChart
              title="Revenue vs Expenses (this month)"
              sub={`${MONTHS[curMonth - 1]} ${curYear} · where the money goes`}
              slices={[
                { label: 'Driver Pay (40%)', value: pnl.driverPay,              color: '#64748B' },
                { label: 'Car Expenses',     value: pnl.expenses,               color: '#F59E0B' },
                { label: 'Company Expenses', value: companyExpensesThisMonth,   color: '#EF4444' },
                { label: 'Net Kept',         value: Math.max(pnl.companyNet - companyExpensesThisMonth, 0), color: '#10B981' },
              ]}
            />
          </div>
        </>
      )}

      {/* Import CTA */}
      <Link href="/import" className="block rounded-2xl bg-gradient-to-r from-indigo-600 to-indigo-700 p-5 shadow-sm hover:from-indigo-700 hover:to-indigo-800 transition-all group">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-semibold uppercase tracking-widest text-indigo-200">TaxiCaller Export</p>
            <p className="mt-1 text-xl font-bold text-white">Import Rides & Generate Invoices</p>
            <p className="mt-1 text-sm text-indigo-200">Upload a .xlsx export to process all corporate accounts at once</p>
          </div>
          <div className="ml-6 flex h-12 w-12 shrink-0 items-center justify-center rounded-xl bg-white/10 group-hover:bg-white/20 transition-colors">
            <svg className="h-6 w-6 text-white" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
            </svg>
          </div>
        </div>
      </Link>

      {/* Recent invoices */}
      {recentInvoices.length > 0 && (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
          <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
            <h2 className="text-sm font-semibold text-gray-900">Recent Invoices</h2>
            <Link href="/invoices" className="text-sm font-medium text-indigo-600 hover:text-indigo-700">View all →</Link>
          </div>
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Invoice #', 'Company', 'Month', 'Total', 'Status'].map((h) => (
                  <th key={h} className="px-6 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {recentInvoices.map((inv) => (
                <tr key={inv.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-6 py-3.5 font-mono text-sm font-medium text-gray-900">#{inv.invoiceNumber}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-700">{inv.company.companyName}</td>
                  <td className="px-6 py-3.5 text-sm text-gray-500">{inv.month} {inv.year}</td>
                  <td className="px-6 py-3.5 text-sm font-medium text-gray-900">{formatCurrency(inv.total)}</td>
                  <td className="px-6 py-3.5">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      inv.status === 'PAID'    ? 'bg-emerald-50 text-emerald-700' :
                      inv.status === 'PENDING' ? 'bg-amber-50 text-amber-700'    :
                                                 'bg-slate-100 text-slate-600'
                    }`}>{inv.status.charAt(0) + inv.status.slice(1).toLowerCase()}</span>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}

function PnlCard({ label, value, tone, sub }: {
  label: string;
  value: number;
  tone: 'neutral' | 'muted' | 'positive' | 'negative';
  sub?: string;
}) {
  const color =
    tone === 'positive' ? 'text-emerald-600' :
    tone === 'negative' ? 'text-red-600'     :
    tone === 'muted'    ? 'text-gray-700'    :
                          'text-gray-900';
  return (
    <div className="rounded-xl bg-gray-50 ring-1 ring-gray-100 p-4">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`mt-2 text-2xl font-bold ${color}`}>{formatCurrency(value)}</p>
      {sub && <p className="mt-0.5 text-xs text-gray-400">{sub}</p>}
    </div>
  );
}
