'use client';
import { useState } from 'react';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';

interface MonthMeta { label: string; month: number; year: number; key: string; }
interface TxSummary  { type: string; amount: number; month: number; year: number; status: string; }
interface ExpenseSummary { amount: number; date: string; paid: boolean; }
interface BrokerVehicleSummary { cabNumber: string; isCompanyCar: boolean; }
interface BrokerRow  { id: string; name: string; isActive: boolean; transactions: TxSummary[]; vehicles: BrokerVehicleSummary[]; expenses: ExpenseSummary[]; }

function computeCell(transactions: TxSummary[], expenses: ExpenseSummary[], month: number, year: number): { net: number; count: number } | null {
  const txs = transactions.filter((t) => t.month === month && t.year === year);
  // Include unpaid expenses for this month/year
  const monthExpenses = expenses.filter((e) => {
    const d = new Date(e.date);
    return d.getMonth() + 1 === month && d.getFullYear() === year && !e.paid;
  });
  if (txs.length === 0 && monthExpenses.length === 0) return null;
  const txNet = txs.reduce((sum, t) => t.type === 'PAYOUT' ? sum - t.amount : sum + t.amount, 0);
  const expNet = monthExpenses.reduce((sum, e) => sum + e.amount, 0);
  return { net: txNet + expNet, count: txs.length + monthExpenses.length };
}

export default function BrokerOverview({ brokers, months }: { brokers: BrokerRow[]; months: MonthMeta[] }) {
  const [panelBroker, setPanelBroker] = useState<BrokerRow | null>(null);

  // Pre-compute net per broker per month
  const grid: Record<string, Record<string, { net: number; count: number } | null>> = {};
  for (const b of brokers) {
    grid[b.id] = {};
    for (const m of months) {
      grid[b.id][m.key] = computeCell(b.transactions, b.expenses, m.month, m.year);
    }
  }

  // Flagged: net is lower than previous month (null prev = not flagged)
  function isFlagged(brokerId: string, monthIdx: number): boolean {
    if (monthIdx === 0) return false;
    const cur  = grid[brokerId][months[monthIdx].key];
    const prev = grid[brokerId][months[monthIdx - 1].key];
    if (cur === null || prev === null) return false;
    return cur.net < prev.net;
  }

  // Column totals
  const colTotals: Record<string, number> = {};
  for (const m of months) {
    colTotals[m.key] = brokers.reduce((sum, b) => sum + (grid[b.id][m.key]?.net ?? 0), 0);
  }

  // Row totals
  const rowTotals: Record<string, number> = {};
  for (const b of brokers) {
    rowTotals[b.id] = months.reduce((sum, m) => sum + (grid[b.id][m.key]?.net ?? 0), 0);
  }

  const grandTotal = Object.values(colTotals).reduce((s, v) => s + v, 0);

  // Per-broker paid/unpaid breakdown (across all time)
  function brokerTotals(b: BrokerRow) {
    const paid   = b.transactions.filter(t => t.status === 'PAID' && t.type !== 'PAYOUT').reduce((s, t) => s + t.amount, 0);
    const unpaid = b.transactions.filter(t => t.status === 'PENDING' && t.type !== 'PAYOUT').reduce((s, t) => s + t.amount, 0);
    const paidExpenses   = b.expenses.filter(e => e.paid).reduce((s, e) => s + e.amount, 0);
    const unpaidExpenses = b.expenses.filter(e => !e.paid).reduce((s, e) => s + e.amount, 0);
    return { paid: paid + paidExpenses, unpaid: unpaid + unpaidExpenses, total: paid + paidExpenses + unpaid + unpaidExpenses };
  }

  if (brokers.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Broker Overview" description="Net balance per broker per month" />
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <p className="text-base font-semibold text-gray-900">No brokers yet</p>
          <p className="mt-1 text-sm text-gray-500">Add brokers to see their monthly overview.</p>
          <Link href="/brokers" className="mt-4 text-sm font-medium text-indigo-600 hover:underline">Go to Brokers →</Link>
        </div>
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Broker Overview"
        description="Net balance per broker per month — positive = broker owes us"
        action={<Link href="/brokers"><span className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800">← All Brokers</span></Link>}
      />

      <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              <th className="sticky left-0 bg-gray-50 px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[160px]">
                Broker
              </th>
              {months.map((m) => (
                <th key={m.key} className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">
                  {m.label}
                </th>
              ))}
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-emerald-500">Paid</th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-amber-500">Unpaid</th>
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {brokers.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                <td className="sticky left-0 bg-white px-5 py-4 hover:bg-gray-50">
                  <button onClick={() => setPanelBroker(b)} className="font-semibold text-indigo-600 hover:text-indigo-800 text-left">
                    {b.name}
                  </button>
                  {!b.isActive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                </td>
                {months.map((m, idx) => {
                  const cell    = grid[b.id][m.key];
                  const flagged = isFlagged(b.id, idx);
                  return (
                    <td
                      key={m.key}
                      className={`px-4 py-4 text-right ${flagged ? 'bg-red-50' : ''}`}
                    >
                      {cell === null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <Link
                          href={`/brokers/${b.id}?month=${m.month}&year=${m.year}`}
                          className={`font-medium hover:underline ${cell.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                        >
                          {cell.net < 0 ? '-' : ''}{formatCurrency(Math.abs(cell.net))}
                          {flagged && <span className="ml-1 text-xs text-red-400">▼</span>}
                        </Link>
                      )}
                    </td>
                  );
                })}
                {(() => {
                  const bt = brokerTotals(b);
                  return (
                    <>
                      <td className="px-4 py-4 text-right text-sm font-medium text-emerald-600">{formatCurrency(bt.paid)}</td>
                      <td className="px-4 py-4 text-right text-sm font-medium text-amber-600">{formatCurrency(bt.unpaid)}</td>
                    </>
                  );
                })()}
                <td className="px-4 py-4 text-right font-semibold text-gray-900">
                  {formatCurrency(rowTotals[b.id])}
                </td>
              </tr>
            ))}
          </tbody>
          <tfoot>
            <tr className="border-t-2 border-gray-200 bg-gray-50">
              <td className="sticky left-0 bg-gray-50 px-5 py-3.5 text-xs font-semibold uppercase tracking-wide text-gray-500">
                Total
              </td>
              {months.map((m) => (
                <td key={m.key} className="px-4 py-3.5 text-right font-semibold text-gray-900">
                  {formatCurrency(colTotals[m.key])}
                </td>
              ))}
              {(() => {
                const allPaid   = brokers.reduce((s, b) => s + brokerTotals(b).paid, 0);
                const allUnpaid = brokers.reduce((s, b) => s + brokerTotals(b).unpaid, 0);
                return (
                  <>
                    <td className="px-4 py-3.5 text-right font-bold text-emerald-600">{formatCurrency(allPaid)}</td>
                    <td className="px-4 py-3.5 text-right font-bold text-amber-600">{formatCurrency(allUnpaid)}</td>
                  </>
                );
              })()}
              <td className="px-4 py-3.5 text-right font-bold text-indigo-600">
                {formatCurrency(grandTotal)}
              </td>
            </tr>
          </tfoot>
        </table>
      </div>

      <p className="text-xs text-gray-400">
        🔴 Red cell = net balance dropped vs previous month &nbsp;·&nbsp; Positive = broker owes us &nbsp;·&nbsp; Negative = we owe them (net payouts)
      </p>

      {/* Side panel overlay */}
      {panelBroker && (
        <>
          <div className="fixed inset-0 z-30 bg-black/20" onClick={() => setPanelBroker(null)} />
          <div className="fixed inset-y-0 right-0 z-40 flex w-80 flex-col bg-white shadow-xl ring-1 ring-gray-200">
            {/* Panel header */}
            <div className="flex items-start justify-between border-b border-gray-100 px-5 py-4">
              <div>
                <h2 className="font-semibold text-gray-900">{panelBroker.name}</h2>
                <div className="mt-1"><Badge variant={panelBroker.isActive ? 'active' : 'inactive'} /></div>
              </div>
              <button onClick={() => setPanelBroker(null)} className="mt-0.5 rounded-md p-1 text-gray-400 hover:text-gray-600 hover:bg-gray-100">
                <svg className="w-5 h-5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                  <path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" />
                </svg>
              </button>
            </div>
            {/* Vehicles */}
            <div className="border-b border-gray-100 px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Vehicles</p>
              {panelBroker.vehicles.length > 0 ? (
                <div className="flex flex-wrap gap-2">
                  {panelBroker.vehicles.map((v) => (
                    <span key={v.cabNumber} className={`inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium ${
                      v.isCompanyCar ? 'bg-indigo-50 text-indigo-700' : 'bg-gray-100 text-gray-700'
                    }`}>
                      <span className="font-mono font-bold">#{v.cabNumber}</span>
                      {v.isCompanyCar && <span className="text-indigo-400">· Co.</span>}
                    </span>
                  ))}
                </div>
              ) : (
                <p className="text-sm text-gray-400">No vehicles assigned</p>
              )}
            </div>
            {/* Paid / Unpaid summary */}
            {panelBroker && (() => {
              const bt = brokerTotals(panelBroker);
              return (
                <div className="border-b border-gray-100 px-5 py-4">
                  <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-2">Summary</p>
                  <div className="grid grid-cols-2 gap-2">
                    <div className="rounded-lg bg-emerald-50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase text-emerald-500">Paid</p>
                      <p className="text-sm font-bold text-emerald-700">{formatCurrency(bt.paid)}</p>
                    </div>
                    <div className="rounded-lg bg-amber-50 px-3 py-2">
                      <p className="text-[10px] font-semibold uppercase text-amber-500">Unpaid</p>
                      <p className="text-sm font-bold text-amber-700">{formatCurrency(bt.unpaid)}</p>
                    </div>
                  </div>
                </div>
              );
            })()}
            {/* Monthly totals */}
            <div className="flex-1 overflow-y-auto px-5 py-4">
              <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Monthly Totals</p>
              <div className="space-y-1">
                {months.map((m) => {
                  const cell = grid[panelBroker.id]?.[m.key];
                  if (!cell) return (
                    <div key={m.key} className="flex justify-between py-1.5 text-sm border-b border-gray-50">
                      <span className="text-gray-400">{m.label}</span>
                      <span className="text-gray-300">—</span>
                    </div>
                  );
                  return (
                    <div key={m.key} className="flex justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
                      <span className="text-gray-600">{m.label}</span>
                      <span className={cell.net >= 0 ? 'font-semibold text-emerald-600' : 'font-semibold text-red-500'}>
                        {formatCurrency(cell.net)}
                      </span>
                    </div>
                  );
                })}
              </div>
            </div>
            {/* Footer link */}
            <div className="border-t border-gray-100 px-5 py-4">
              <Link href={`/brokers/${panelBroker.id}`} className="text-sm font-medium text-indigo-600 hover:text-indigo-700">
                View full profile →
              </Link>
            </div>
          </div>
        </>
      )}
    </div>
  );
}
