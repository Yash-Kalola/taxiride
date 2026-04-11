import { prisma } from '@/lib/db';
import { formatCurrency } from '@/lib/tax';
import PageHeader from '@/components/ui/PageHeader';
import DashboardRefresh from '@/components/dashboard/DashboardRefresh';
import Link from 'next/link';

export const dynamic = 'force-dynamic';

export default async function DashboardPage() {
  let stats = { total: 0, paid: 0, pending: 0, draft: 0, overdue: 0, invoiceCount: 0, overdueCount: 0 };
  let recentInvoices: any[] = [];
  let companiesCount = 0;
  let ridesCount = 0;
  let dbConnected = true;

  try {
    const [allInvoices, companies, rides] = await Promise.all([
      prisma.invoice.findMany({ include: { company: { select: { companyName: true } } }, orderBy: { createdAt: 'desc' } }),
      prisma.company.count(),
      prisma.ride.count(),
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
