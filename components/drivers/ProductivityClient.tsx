'use client';
import { useState, useEffect, useMemo } from 'react';
import Link from 'next/link';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';

interface Row {
  driverId: string; driverName: string; isActive: boolean;
  currentVehicle: string | null; currentShift: 'MORNING' | 'EVENING' | null;
  sheetCount: number; totalGross: number; totalDeductions: number;
  totalNetPay: number; totalHours: number; productivity: number | null;
}

type SortKey = 'name' | 'vehicle' | 'shift' | 'hours' | 'gross' | 'net' | 'productivity';
type SortDir = 'asc' | 'desc';

export default function ProductivityClient({ initialMonth, initialYear }: { initialMonth: number; initialYear: number }) {
  const [month,   setMonth]   = useState(initialMonth);
  const [year,    setYear]    = useState(initialYear);
  const [rows,    setRows]    = useState<Row[]>([]);
  const [loading, setLoading] = useState(true);
  const [activeOnly, setActiveOnly] = useState(true);

  const [sortKey, setSortKey] = useState<SortKey>('net');
  const [sortDir, setSortDir] = useState<SortDir>('desc');

  useEffect(() => {
    setLoading(true);
    fetch(`/api/drivers/productivity?month=${month}&year=${year}&activeOnly=${activeOnly}`)
      .then((r) => r.json())
      .then((d) => { setRows(d.rows ?? []); setLoading(false); })
      .catch(() => setLoading(false));
  }, [month, year, activeOnly]);

  const sorted = useMemo(() => {
    const copy = [...rows];
    const mul = sortDir === 'asc' ? 1 : -1;
    copy.sort((a, b) => {
      const get = (r: Row): number | string => {
        switch (sortKey) {
          case 'name':         return r.driverName.toLowerCase();
          case 'vehicle':      return parseInt(r.currentVehicle ?? '0') || 0;
          case 'shift':        return r.currentShift ?? '';
          case 'hours':        return r.totalHours;
          case 'gross':        return r.totalGross;
          case 'net':          return r.totalNetPay;
          case 'productivity': return r.productivity ?? -Infinity;
        }
      };
      const va = get(a); const vb = get(b);
      if (typeof va === 'string' && typeof vb === 'string') return va.localeCompare(vb) * mul;
      return ((va as number) - (vb as number)) * mul;
    });
    return copy;
  }, [rows, sortKey, sortDir]);

  // Top 3 / bottom 3 by net pay (amongst rows with sheets)
  const { topIds, bottomIds } = useMemo(() => {
    const withActivity = rows.filter((r) => r.sheetCount > 0);
    const byNet = [...withActivity].sort((a, b) => b.totalNetPay - a.totalNetPay);
    const topIds    = new Set(byNet.slice(0, 3).map((r) => r.driverId));
    const bottomIds = new Set(byNet.slice(-3).map((r) => r.driverId));
    // If fewer than 6 drivers, don't double-color
    if (byNet.length < 6) {
      byNet.slice(0, 3).forEach((r) => bottomIds.delete(r.driverId));
    }
    return { topIds, bottomIds };
  }, [rows]);

  function toggleSort(k: SortKey) {
    if (sortKey === k) setSortDir(sortDir === 'asc' ? 'desc' : 'asc');
    else { setSortKey(k); setSortDir(k === 'name' || k === 'vehicle' ? 'asc' : 'desc'); }
  }

  const totals = useMemo(() => ({
    gross: rows.reduce((s, r) => s + r.totalGross, 0),
    net:   rows.reduce((s, r) => s + r.totalNetPay, 0),
    hours: rows.reduce((s, r) => s + r.totalHours, 0),
  }), [rows]);

  const years = [year - 1, year, year + 1].sort((a, b) => b - a);

  return (
    <>
      <PageHeader
        title="Driver Productivity"
        description={`${rows.length} driver${rows.length !== 1 ? 's' : ''} · ${MONTHS[month - 1]} ${year}`}
      />

      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-4">
        <div className="flex flex-wrap items-end gap-3">
          <Select label="Month" value={String(month)} onChange={(e) => setMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
          <Select label="Year" value={String(year)} onChange={(e) => setYear(parseInt(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <label className="inline-flex items-center gap-2 mt-6">
            <input type="checkbox" checked={activeOnly} onChange={(e) => setActiveOnly(e.target.checked)}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            <span className="text-sm text-gray-700">Active drivers only</span>
          </label>
        </div>
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : rows.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <p className="text-base font-semibold text-gray-900">No driver data</p>
          <p className="mt-1 text-sm text-gray-500">Add drivers and daily sheets to see productivity.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <Th label="Driver"       k="name"         sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <Th label="Vehicle"      k="vehicle"      sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <Th label="Shift"        k="shift"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} />
                  <Th label="Hours"        k="hours"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <Th label="Gross"        k="gross"        sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <Th label="Net Pay"      k="net"          sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                  <Th label="$/hr"         k="productivity" sortKey={sortKey} sortDir={sortDir} onClick={toggleSort} align="right" />
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((r) => {
                  const tone = topIds.has(r.driverId)
                    ? 'bg-emerald-50/60'
                    : bottomIds.has(r.driverId) ? 'bg-amber-50/60' : '';
                  return (
                    <tr key={r.driverId} className={`hover:bg-gray-50 ${tone}`}>
                      <td className="px-4 py-3">
                        <Link href={`/drivers/${r.driverId}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                          {r.driverName}
                        </Link>
                        {!r.isActive && <span className="ml-2 text-xs text-gray-400">(inactive)</span>}
                        {r.sheetCount === 0 && <p className="text-xs text-gray-400 mt-0.5">No sheets this month</p>}
                      </td>
                      <td className="px-4 py-3 font-mono font-bold text-gray-900">
                        {r.currentVehicle ? `#${r.currentVehicle}` : <span className="text-gray-300 font-sans font-normal">—</span>}
                      </td>
                      <td className="px-4 py-3">
                        {r.currentShift ? <Badge variant={r.currentShift === 'MORNING' ? 'morning' : 'evening'} /> : <span className="text-gray-300">—</span>}
                      </td>
                      <td className="px-4 py-3 text-right text-gray-700 whitespace-nowrap">{r.totalHours.toFixed(1)}</td>
                      <td className="px-4 py-3 text-right text-gray-900 whitespace-nowrap">{formatCurrency(r.totalGross)}</td>
                      <td className={`px-4 py-3 text-right font-semibold whitespace-nowrap ${r.totalNetPay >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                        {formatCurrency(r.totalNetPay)}
                      </td>
                      <td className="px-4 py-3 text-right font-semibold text-indigo-600 whitespace-nowrap">
                        {r.productivity === null ? <span className="text-gray-300 font-normal">—</span> : formatCurrency(r.productivity)}
                      </td>
                    </tr>
                  );
                })}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500" colSpan={3}>Totals</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-700 whitespace-nowrap">{totals.hours.toFixed(1)}</td>
                  <td className="px-4 py-3 text-right font-bold text-gray-900 whitespace-nowrap">{formatCurrency(totals.gross)}</td>
                  <td className={`px-4 py-3 text-right font-bold whitespace-nowrap ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(totals.net)}
                  </td>
                  <td />
                </tr>
              </tfoot>
            </table>
          </div>

          <div className="flex gap-4 px-4 py-3 border-t border-gray-100 text-xs text-gray-500">
            <span><span className="inline-block w-3 h-3 rounded bg-emerald-100 mr-1.5 align-middle" />Top 3 earners</span>
            <span><span className="inline-block w-3 h-3 rounded bg-amber-100 mr-1.5 align-middle" />Bottom 3 earners</span>
            <span className="text-gray-400">· Click any column header to sort</span>
          </div>
        </div>
      )}
    </>
  );
}

function Th({ label, k, sortKey, sortDir, onClick, align }: {
  label: string; k: SortKey; sortKey: SortKey; sortDir: SortDir;
  onClick: (k: SortKey) => void; align?: 'left' | 'right';
}) {
  const active = sortKey === k;
  return (
    <th className={`px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap cursor-pointer select-none hover:text-gray-700 ${align === 'right' ? 'text-right' : 'text-left'}`}
      onClick={() => onClick(k)}>
      {label}{active && <span className="ml-1 text-indigo-500">{sortDir === 'asc' ? '▲' : '▼'}</span>}
    </th>
  );
}
