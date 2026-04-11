'use client';
import Link from 'next/link';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';

interface MonthMeta { label: string; month: number; year: number; key: string; }
interface TxSummary  { type: string; amount: number; month: number; year: number; }
interface BrokerRow  { id: string; name: string; isActive: boolean; transactions: TxSummary[]; }

function computeNet(transactions: TxSummary[], month: number, year: number): number | null {
  const txs = transactions.filter((t) => t.month === month && t.year === year);
  if (txs.length === 0) return null;
  return txs.reduce((sum, t) => t.type === 'PAYOUT' ? sum - t.amount : sum + t.amount, 0);
}

export default function BrokerOverview({ brokers, months }: { brokers: BrokerRow[]; months: MonthMeta[] }) {
  // Pre-compute net per broker per month
  const grid: Record<string, Record<string, number | null>> = {};
  for (const b of brokers) {
    grid[b.id] = {};
    for (const m of months) {
      grid[b.id][m.key] = computeNet(b.transactions, m.month, m.year);
    }
  }

  // Flagged: net is lower than previous month (null prev = not flagged)
  function isFlagged(brokerId: string, monthIdx: number): boolean {
    if (monthIdx === 0) return false;
    const cur  = grid[brokerId][months[monthIdx].key];
    const prev = grid[brokerId][months[monthIdx - 1].key];
    if (cur === null || prev === null) return false;
    return cur < prev;
  }

  // Column totals
  const colTotals: Record<string, number> = {};
  for (const m of months) {
    colTotals[m.key] = brokers.reduce((sum, b) => sum + (grid[b.id][m.key] ?? 0), 0);
  }

  // Row totals
  const rowTotals: Record<string, number> = {};
  for (const b of brokers) {
    rowTotals[b.id] = months.reduce((sum, m) => sum + (grid[b.id][m.key] ?? 0), 0);
  }

  const grandTotal = Object.values(colTotals).reduce((s, v) => s + v, 0);

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
              <th className="px-4 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Total</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {brokers.map((b) => (
              <tr key={b.id} className="hover:bg-gray-50 transition-colors">
                <td className="sticky left-0 bg-white px-5 py-4 hover:bg-gray-50">
                  <Link href={`/brokers/${b.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">
                    {b.name}
                  </Link>
                  {!b.isActive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                </td>
                {months.map((m, idx) => {
                  const net     = grid[b.id][m.key];
                  const flagged = isFlagged(b.id, idx);
                  return (
                    <td
                      key={m.key}
                      className={`px-4 py-4 text-right ${flagged ? 'bg-red-50' : ''}`}
                    >
                      {net === null ? (
                        <span className="text-gray-300">—</span>
                      ) : (
                        <Link
                          href={`/brokers/${b.id}?month=${m.month}&year=${m.year}`}
                          className={`font-medium hover:underline ${net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                        >
                          {net < 0 ? '-' : ''}{formatCurrency(Math.abs(net))}
                          {flagged && <span className="ml-1 text-xs text-red-400">▼</span>}
                        </Link>
                      )}
                    </td>
                  );
                })}
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
    </div>
  );
}
