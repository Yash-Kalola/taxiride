'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Select from '@/components/ui/Select';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';
import DashboardPDFButton from '@/components/dashboard/DashboardPDFButton';
import { ExpenseBreakdownChart } from '@/components/dashboard/DashboardCharts';

interface VehicleStats {
  cabNumber: string;
  gross:     number;
  driverPay: number;
  gas:       number;
  extra:     number;
  repairs:   number;
  profit:    number;
}

export default function PerVehicleSection({
  initialPerVehicle,
  initialMonth,
  initialYear,
  availableYears,
}: {
  initialPerVehicle: VehicleStats[];
  initialMonth:      number;
  initialYear:       number;
  availableYears:    number[];
}) {
  const [rows,    setRows]    = useState<VehicleStats[]>(initialPerVehicle);
  const [month,   setMonth]   = useState<number>(initialMonth);
  const [year,    setYear]    = useState<number>(initialYear);
  const [loading, setLoading] = useState(false);
  const [isInitial, setIsInitial] = useState(true);

  async function refresh(m: number, y: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/period-stats?month=${m}&year=${y}`);
      if (res.ok) {
        const data = await res.json();
        if (data.perVehicle) setRows(data.perVehicle);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (isInitial) { setIsInitial(false); return; }
    refresh(month, year);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [month, year]);

  const label          = `${MONTHS[month - 1]} ${year}`;
  const vehicleProfit  = rows.reduce((a, v) => a + v.profit, 0);
  const totalGross     = rows.reduce((a, v) => a + v.gross, 0);
  const totalDriverPay = rows.reduce((a, v) => a + v.driverPay, 0);
  const totalGas       = rows.reduce((a, v) => a + v.gas, 0);
  const totalExtra     = rows.reduce((a, v) => a + v.extra, 0);
  const totalRepairs   = rows.reduce((a, v) => a + v.repairs, 0);

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Per-Vehicle Profit — {label}</h2>
          {loading && <p className="text-xs text-indigo-500 mt-0.5">Loading…</p>}
        </div>
        <div className="flex items-center gap-2">
          <Select value={String(year)} onChange={(e) => setYear(parseInt(e.target.value))}>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select value={String(month)} onChange={(e) => setMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
          <DashboardPDFButton href={`/api/dashboard/per-vehicle-pdf?month=${month}&year=${year}`} />
        </div>
      </div>

      {rows.length === 0 ? (
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
              {rows.map((v) => (
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
                <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{formatCurrency(totalGross)}</td>
                <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(totalDriverPay)}</td>
                <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(totalGas)}</td>
                <td className="px-4 py-3 font-semibold text-gray-500 whitespace-nowrap">−{formatCurrency(totalExtra)}</td>
                <td className={`px-4 py-3 font-semibold whitespace-nowrap ${totalRepairs > 0 ? 'text-gray-500' : 'text-gray-300'}`}>
                  {totalRepairs > 0 ? `−${formatCurrency(totalRepairs)}` : '—'}
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

      {rows.length > 0 && (
        <div className="mt-6 grid grid-cols-1 md:grid-cols-2 xl:grid-cols-3 gap-4">
          {rows.map((v) => {
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
  );
}
