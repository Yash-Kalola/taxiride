'use client';
import { useState, useMemo, useEffect } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';

interface DriverRef { id: string; name: string; }
interface Sheet {
  id: string; driverId: string; vehicleNumber: string; date: string;
  shift: 'MORNING' | 'EVENING';
  grossEarnings: number; gasDeduction: number; debitFee: number; debitTransactionCount: number;
  callChargeDeduction: number; extraExpenseDeduction: number;
  hoursWorked: number; netDriverPay: number; companyNet: number; payoutPeriod: number;
  month: number; year: number; isPaid: boolean;
  driver: DriverRef;
}

export default function DailySheetsClient({
  initialSheets, drivers, initialVehicleNumbers, initialMonth, initialYear,
}: {
  initialSheets: Sheet[];
  drivers: DriverRef[];
  initialVehicleNumbers: string[];
  initialMonth: number;
  initialYear: number;
}) {
  const [sheets,        setSheets]        = useState<Sheet[]>(initialSheets);
  const [loading,       setLoading]       = useState(false);
  const [vehicleNumbers] = useState<string[]>(initialVehicleNumbers);
  const [selected, setSelected] = useState<Set<string>>(new Set());

  // Filter state
  const [filterDriver,   setFilterDriver]   = useState<string>('');
  const [filterVehicle,  setFilterVehicle]  = useState<string>('');
  const [filterMonth,    setFilterMonth]    = useState<number>(initialMonth);
  const [filterYear,     setFilterYear]     = useState<number>(initialYear);
  const [filterShift,    setFilterShift]    = useState<string>('');
  const [filterPaid,     setFilterPaid]     = useState<string>(''); // '', 'true', 'false'

  async function refresh() {
    setLoading(true);
    const params = new URLSearchParams();
    if (filterDriver)  params.set('driverId', filterDriver);
    if (filterVehicle) params.set('vehicleNumber', filterVehicle);
    params.set('month', String(filterMonth));
    params.set('year', String(filterYear));
    if (filterShift)   params.set('shift', filterShift);
    if (filterPaid)    params.set('isPaid', filterPaid);
    const res = await fetch('/api/daily-sheets?' + params.toString());
    if (res.ok) setSheets(await res.json());
    setLoading(false);
    setSelected(new Set());
  }

  // Re-fetch whenever filters change (including initial month)
  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [filterDriver, filterVehicle, filterMonth, filterYear, filterShift, filterPaid]);

  const totals = useMemo(() => {
    const gross = sheets.reduce((s, x) => s + x.grossEarnings, 0);
    // Net shown on this master list is COMPANY NET (profit per shift),
    // not driver pay — owner's-eye view per the client's spec.
    const net   = sheets.reduce((s, x) => s + (x.companyNet ?? 0), 0);
    return { gross, net };
  }, [sheets]);

  function toggleSelect(id: string) {
    setSelected((prev) => {
      const next = new Set(prev);
      if (next.has(id)) next.delete(id); else next.add(id);
      return next;
    });
  }
  function toggleSelectAll() {
    if (selected.size === sheets.length && sheets.length > 0) setSelected(new Set());
    else setSelected(new Set(sheets.map((s) => s.id)));
  }

  async function bulkMarkPaid(isPaid: boolean) {
    if (selected.size === 0) return;
    const verb = isPaid ? 'mark paid' : 'mark unpaid';
    if (!confirm(`${verb.toUpperCase()} ${selected.size} selected sheet${selected.size !== 1 ? 's' : ''}?`)) return;
    const res = await fetch('/api/daily-sheets', {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ ids: Array.from(selected), isPaid }),
    });
    if (res.ok) await refresh();
    else alert(`Failed to ${verb}.`);
  }

  async function deleteSheet(s: Sheet) {
    if (!confirm(`Delete daily sheet for ${s.driver.name} on ${format(new Date(s.date), 'MMM d')}?`)) return;
    const res = await fetch(`/api/daily-sheets/${s.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) await refresh();
  }

  const years = Array.from(new Set([
    initialYear - 1, initialYear, initialYear + 1,
    ...sheets.map((s) => s.year),
  ])).sort((a, b) => b - a);

  return (
    <>
      <PageHeader
        title="Daily Sheets"
        description={`${sheets.length} sheet${sheets.length !== 1 ? 's' : ''} · ${formatCurrency(totals.net)} company net`}
      />

      {/* Filters */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-6 gap-3">
          <Select label="Driver" value={filterDriver} onChange={(e) => setFilterDriver(e.target.value)}>
            <option value="">All Drivers</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>
          <Select label="Vehicle" value={filterVehicle} onChange={(e) => setFilterVehicle(e.target.value)}>
            <option value="">All Vehicles</option>
            {vehicleNumbers.map((v) => <option key={v} value={v}>#{v}</option>)}
          </Select>
          <Select label="Month" value={String(filterMonth)} onChange={(e) => setFilterMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
          <Select label="Year" value={String(filterYear)} onChange={(e) => setFilterYear(parseInt(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select label="Shift" value={filterShift} onChange={(e) => setFilterShift(e.target.value)}>
            <option value="">All Shifts</option>
            <option value="MORNING">Morning</option>
            <option value="EVENING">Evening</option>
          </Select>
          <Select label="Paid Status" value={filterPaid} onChange={(e) => setFilterPaid(e.target.value)}>
            <option value="">All</option>
            <option value="false">Unpaid</option>
            <option value="true">Paid</option>
          </Select>
        </div>
      </div>

      {/* Bulk action bar */}
      {selected.size > 0 && (
        <div className="flex items-center justify-between rounded-xl bg-indigo-50 border border-indigo-100 px-4 py-3">
          <span className="text-sm font-medium text-indigo-700">
            {selected.size} selected
          </span>
          <div className="flex gap-2">
            <Button size="sm" variant="primary" onClick={() => bulkMarkPaid(true)}>Mark Paid</Button>
            <Button size="sm" variant="secondary" onClick={() => bulkMarkPaid(false)}>Mark Unpaid</Button>
            <Button size="sm" variant="ghost" onClick={() => setSelected(new Set())}>Clear</Button>
          </div>
        </div>
      )}

      {loading ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : sheets.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <p className="text-base font-semibold text-gray-900">No daily sheets match these filters</p>
          <p className="mt-1 text-sm text-gray-500">Add sheets from a driver&apos;s detail page.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  <th className="px-3 py-3 text-left">
                    <input type="checkbox"
                      checked={selected.size === sheets.length && sheets.length > 0}
                      onChange={toggleSelectAll}
                      className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                    />
                  </th>
                  {['Date', 'Driver', 'Cab', 'Shift', 'Gross', 'Net (60% − exp.)', 'Paid', ''].map((h) => (
                    <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sheets.map((s) => (
                  <tr key={s.id} className="group hover:bg-gray-50">
                    <td className="px-3 py-3">
                      <input type="checkbox"
                        checked={selected.has(s.id)}
                        onChange={() => toggleSelect(s.id)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                    </td>
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{format(new Date(s.date), 'MMM d, yyyy')}</td>
                    <td className="px-3 py-3">
                      <Link href={`/drivers/${s.driverId}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                        {s.driver.name}
                      </Link>
                    </td>
                    <td className="px-3 py-3 font-mono font-bold text-gray-900">#{s.vehicleNumber}</td>
                    <td className="px-3 py-3"><Badge variant={s.shift === 'MORNING' ? 'morning' : 'evening'} /></td>
                    <td className="px-3 py-3 text-gray-900 whitespace-nowrap">{formatCurrency(s.grossEarnings)}</td>
                    <td className={`px-3 py-3 font-semibold whitespace-nowrap ${(s.companyNet ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                        title={`60% (${formatCurrency(s.grossEarnings * 0.6)}) − debit ${formatCurrency(Math.max(s.debitFee - s.debitTransactionCount, 0))} − gas ${formatCurrency(s.gasDeduction)} − call ${formatCurrency(s.callChargeDeduction)} − extra ${formatCurrency(s.extraExpenseDeduction)}`}>
                      {formatCurrency(s.companyNet ?? 0)}
                    </td>
                    <td className="px-3 py-3"><Badge variant={s.isPaid ? 'paid' : 'pending'} /></td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Link href={`/drivers/${s.driverId}`}>
                          <Button size="sm" variant="ghost">Open</Button>
                        </Link>
                        <Button size="sm" variant="ghost" onClick={() => deleteSheet(s)}
                          className="text-red-500 hover:bg-red-50">Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-3 py-3" />
                  <td className="px-3 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500" colSpan={4}>
                    Totals ({sheets.length} sheet{sheets.length !== 1 ? 's' : ''})
                  </td>
                  <td className="px-3 py-3 font-bold text-gray-900 whitespace-nowrap">{formatCurrency(totals.gross)}</td>
                  <td className={`px-3 py-3 font-bold whitespace-nowrap ${totals.net >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(totals.net)}
                  </td>
                  <td className="px-3 py-3" colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}
    </>
  );
}
