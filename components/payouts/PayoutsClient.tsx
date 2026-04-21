'use client';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';
import { formatPeriodLabel } from '@/lib/driver-pay';
import { MONTHS } from '@/lib/constants';

interface DriverRef { id: string; name: string; }
interface Payout {
  id: string | null;            // null => virtual row (no DB record yet)
  driverId: string; payoutPeriod: number; month: number; year: number;
  periodStart: string; periodEnd: string;
  totalGross: number; totalDeductions: number; totalNetPay: number;
  status: 'DRAFT' | 'PAID' | 'VIRTUAL'; paidDate: string | null;
  driver: DriverRef;
}

export default function PayoutsClient({
  initialPayouts, drivers, initialMonth, initialYear,
}: {
  initialPayouts: Payout[]; drivers: DriverRef[];
  initialMonth: number; initialYear: number;
}) {
  const [payouts,      setPayouts]      = useState<Payout[]>(initialPayouts);
  const [loading,      setLoading]      = useState(false);
  const [generating,   setGenerating]   = useState(false);
  const [filterMonth,  setFilterMonth]  = useState(initialMonth);
  const [filterYear,   setFilterYear]   = useState(initialYear);
  const [filterPeriod, setFilterPeriod] = useState<string>(''); // '', '1', '2', '3'
  const [filterStatus, setFilterStatus] = useState<string>('DRAFT'); // default to unpaid; user can switch to '', 'PAID'
  const [filterDriver, setFilterDriver] = useState<string>('');

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    params.set('month', String(filterMonth));
    params.set('year',  String(filterYear));
    if (filterPeriod) params.set('period', filterPeriod);
    if (filterStatus) params.set('status', filterStatus);
    if (filterDriver) params.set('driverId', filterDriver);
    params.set('includeVirtual', '1');
    const res = await fetch('/api/payouts?' + params.toString());
    if (res.ok) setPayouts(await res.json());
    setLoading(false);
  }

  /** Materialize a virtual row by calling POST /api/payouts. Returns the new id. */
  async function materialize(p: Payout): Promise<string | null> {
    const res = await fetch('/api/payouts', {
      method:  'POST',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({
        driverId:     p.driverId,
        payoutPeriod: p.payoutPeriod,
        month:        p.month,
        year:         p.year,
      }),
    });
    if (!res.ok) { alert('Failed to create payout record'); return null; }
    const created = await res.json();
    return created?.id ?? null;
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterMonth, filterYear, filterPeriod, filterStatus, filterDriver]);

  async function generateAll() {
    const periodNum = filterPeriod ? parseInt(filterPeriod) : null;
    if (!periodNum) { alert('Select a period (1, 2, or 3) first'); return; }
    if (!confirm(`Generate payout records for ALL active drivers for Period ${periodNum} — ${MONTHS[filterMonth - 1]} ${filterYear}? Existing records will be recomputed.`)) return;
    setGenerating(true);
    try {
      const res = await fetch('/api/payouts/generate-all', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ payoutPeriod: periodNum, month: filterMonth, year: filterYear }),
      });
      const data = await res.json();
      if (!res.ok) { alert(data.error ?? 'Failed to generate'); return; }
      await refresh();
      alert(`Generated ${data.generated} payout record${data.generated !== 1 ? 's' : ''}.`);
    } finally { setGenerating(false); }
  }

  async function markPaid(p: Payout, nextStatus: 'DRAFT' | 'PAID') {
    let id = p.id;
    // Virtual row: persist first, then mark paid.
    if (!id) {
      id = await materialize(p);
      if (!id) return;
    }
    const res = await fetch(`/api/payouts/${id}/pay`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) await refresh();
    else alert('Failed to update payout');
  }

  async function markAllPaid() {
    // "Unpaid" means DRAFT or VIRTUAL (virtual rows are implicitly unpaid).
    const unpaid = payouts.filter((p) => p.status === 'DRAFT' || p.status === 'VIRTUAL');
    if (unpaid.length === 0) { alert('No unpaid payouts in current filter'); return; }
    if (!confirm(`Mark ${unpaid.length} unpaid payout${unpaid.length !== 1 ? 's' : ''} as PAID? This also marks their daily sheets as paid.`)) return;

    // Collect per-driver failures so one bad row doesn't silently skip the
    // rest of the batch — surface the list to the user.
    const failures: string[] = [];
    for (const p of unpaid) {
      try {
        let id = p.id;
        if (!id) {
          id = await materialize(p);
          if (!id) { failures.push(`${p.driver?.name ?? p.driverId}: failed to create payout`); continue; }
        }
        const res = await fetch(`/api/payouts/${id}/pay`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ status: 'PAID' }),
        });
        if (!res.ok) {
          const body = await res.json().catch(() => ({} as any));
          failures.push(`${p.driver?.name ?? p.driverId}: ${body?.error ?? `HTTP ${res.status}`}`);
        }
      } catch (err: any) {
        failures.push(`${p.driver?.name ?? p.driverId}: ${err?.message ?? 'network error'}`);
      }
    }

    await refresh();

    if (failures.length > 0) {
      const paidCount = unpaid.length - failures.length;
      alert(
        `Marked ${paidCount} of ${unpaid.length} paid.\n\n` +
        `Failed (${failures.length}):\n` +
        failures.slice(0, 10).join('\n') +
        (failures.length > 10 ? `\n…and ${failures.length - 10} more` : '')
      );
    }
  }

  /** Open a per-driver PDF. For virtual rows, materialize first. */
  async function openPDF(p: Payout) {
    let id = p.id;
    if (!id) {
      id = await materialize(p);
      if (!id) return;
      await refresh();
    }
    window.open(`/api/payouts/${id}/pdf`, '_blank');
  }

  function downloadAllPDF() {
    if (!filterPeriod) { alert('Select a period first to download a multi-driver PDF'); return; }
    window.open(`/api/payouts/pdf?period=${filterPeriod}&month=${filterMonth}&year=${filterYear}`, '_blank');
  }

  const totals = useMemo(() => ({
    gross: payouts.reduce((s, p) => s + p.totalGross, 0),
    net:   payouts.reduce((s, p) => s + p.totalNetPay, 0),
  }), [payouts]);

  const years = Array.from(new Set([initialYear - 1, initialYear, initialYear + 1, ...payouts.map((p) => p.year)])).sort((a, b) => b - a);

  return (
    <>
      <PageHeader
        title="10-Day Payouts"
        description={`${payouts.length} record${payouts.length !== 1 ? 's' : ''} · ${formatCurrency(totals.net)} driver pay`}
        action={
          <div className="flex gap-2">
            <Button variant="secondary" onClick={downloadAllPDF} disabled={!filterPeriod}>Download PDF</Button>
            <Button variant="primary" onClick={generateAll} disabled={!filterPeriod || generating}>
              {generating ? 'Generating…' : 'Generate All'}
            </Button>
          </div>
        }
      />

      {/* Filters */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-5 gap-3">
          <Select label="Month" value={String(filterMonth)} onChange={(e) => setFilterMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
          <Select label="Year" value={String(filterYear)} onChange={(e) => setFilterYear(parseInt(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select label="Period" value={filterPeriod} onChange={(e) => setFilterPeriod(e.target.value)}>
            <option value="">All Periods</option>
            <option value="1">Period 1 (days 1–10)</option>
            <option value="2">Period 2 (days 11–20)</option>
            <option value="3">Period 3 (days 21–end)</option>
          </Select>
          <Select label="Status" value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)}>
            <option value="">All</option>
            <option value="DRAFT">Unpaid</option>
            <option value="PAID">Paid</option>
          </Select>
          <Select label="Driver" value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)}>
            <option value="">All Drivers</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
        </div>
      </div>

      {/* Bulk action bar — counts DRAFT + VIRTUAL as unpaid */}
      {payouts.some((p) => p.status === 'DRAFT' || p.status === 'VIRTUAL') && (
        <div className="flex items-center justify-between rounded-xl bg-amber-50 border border-amber-100 px-4 py-3">
          <span className="text-sm font-medium text-amber-700">
            {payouts.filter((p) => p.status === 'DRAFT' || p.status === 'VIRTUAL').length} unpaid payout{payouts.filter((p) => p.status === 'DRAFT' || p.status === 'VIRTUAL').length !== 1 ? 's' : ''} in current filter
          </span>
          <Button size="sm" variant="primary" onClick={markAllPaid}>Mark All Paid</Button>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : payouts.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <p className="text-base font-semibold text-gray-900">No drivers with activity in this period</p>
          <p className="mt-1 text-sm text-gray-500">Change the month / period filter above, or add daily sheets for drivers in this period.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Driver', 'Period', 'Dates', 'Gross', 'Driver Pay', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {payouts.map((p) => {
                  const key = p.id ?? `virt-${p.driverId}-${p.payoutPeriod}-${p.month}-${p.year}`;
                  const isVirtual = p.status === 'VIRTUAL';
                  return (
                    <tr key={key} className="group hover:bg-gray-50">
                      <td className="px-4 py-3">
                        <Link href={`/drivers/${p.driverId}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                          {p.driver.name}
                        </Link>
                      </td>
                      <td className="px-4 py-3 text-gray-700">P{p.payoutPeriod} · {MONTHS[p.month - 1].slice(0, 3)} {p.year}</td>
                      <td className="px-4 py-3 text-gray-500 whitespace-nowrap">{formatPeriodLabel(p.payoutPeriod as 1|2|3, p.month, p.year)}</td>
                      <td className="px-4 py-3 text-gray-900 whitespace-nowrap">{formatCurrency(p.totalGross)}</td>
                      <td className={`px-4 py-3 font-semibold whitespace-nowrap ${p.totalNetPay >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(p.totalNetPay)}
                      </td>
                      <td className="px-4 py-3">
                        {isVirtual ? (
                          <span
                            title="Live totals from daily sheets — no payout record saved yet. Clicking Mark Paid or PDF will save it first."
                            className="inline-flex items-center rounded-full bg-slate-50 px-2 py-0.5 text-xs font-medium text-slate-500 ring-1 ring-slate-200"
                          >
                            Not generated
                          </span>
                        ) : (
                          <>
                            <Badge variant={p.status === 'PAID' ? 'paid' : 'draft'} />
                            {p.paidDate && <p className="mt-0.5 text-xs text-gray-400">{format(new Date(p.paidDate), 'MMM d')}</p>}
                          </>
                        )}
                      </td>
                      <td className="px-4 py-3">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="ghost" onClick={() => openPDF(p)}>PDF</Button>
                          {p.status === 'PAID' ? (
                            <Button size="sm" variant="ghost" onClick={() => markPaid(p, 'DRAFT')} className="text-amber-600 hover:bg-amber-50">
                              Reopen
                            </Button>
                          ) : (
                            <Button size="sm" variant="ghost" onClick={() => markPaid(p, 'PAID')} className="text-emerald-600 hover:bg-emerald-50">
                              Mark Paid
                            </Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500" colSpan={3}>
                    Totals ({payouts.length})
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{formatCurrency(totals.gross)}</td>
                  <td className={`px-4 py-3 font-bold whitespace-nowrap ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(totals.net)}
                  </td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
