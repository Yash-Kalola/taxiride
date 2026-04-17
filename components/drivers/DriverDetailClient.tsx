'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';
import { computePayBreakdown, formatPeriodLabel } from '@/lib/driver-pay';
import { MONTHS } from '@/lib/constants';

interface Assignment {
  id: string; vehicleNumber: string; shift: 'MORNING' | 'EVENING';
  startDate: string; endDate: string | null; isActive: boolean;
}
interface DailySheet {
  id: string; driverId: string; vehicleNumber: string; date: string;
  shift: 'MORNING' | 'EVENING';
  grossEarnings: number; gasDeduction: number; debitFee: number; debitTransactionCount: number;
  callChargeDeduction: number; extraExpenseDeduction: number; extraExpenseNote: string;
  hoursWorked: number; netDriverPay: number; companyNet: number; payoutPeriod: number;
  month: number; year: number; isPaid: boolean; paidDate: string | null;
}
interface Payout {
  id: string; driverId: string; payoutPeriod: number; month: number; year: number;
  periodStart: string; periodEnd: string;
  totalGross: number; totalDeductions: number; totalNetPay: number;
  status: 'DRAFT' | 'PAID'; paidDate: string | null; notes: string;
}
interface Driver {
  id: string; name: string; phone: string; licenseNumber: string;
  isActive: boolean; startDate: string; endDate: string | null;
  assignments: Assignment[]; dailySheets: DailySheet[]; payouts: Payout[];
}

const EMPTY_SHEET = {
  date:                  new Date().toISOString().split('T')[0],
  shift:                 'MORNING' as 'MORNING' | 'EVENING',
  vehicleNumber:         '',
  grossEarnings:         '',
  gasDeduction:          '',
  debitFee:              '',       // total debit settlement from terminal
  debitTransactionCount: '',       // # of debit txns ($1 each subtracted from settlement)
  callChargeDeduction:   '',
  extraExpenseDeduction: '',
  extraExpenseNote:      '',
};

function parseNum(v: string): number { const n = parseFloat(v); return Number.isFinite(n) ? n : 0; }
function parseInt0(v: string): number { const n = parseInt(v); return Number.isFinite(n) ? n : 0; }

export default function DriverDetailClient({ initialDriver }: { initialDriver: Driver }) {
  const [driver,    setDriver]    = useState<Driver>(initialDriver);
  const today       = new Date();
  const [viewMonth, setViewMonth] = useState(today.getMonth() + 1);
  const [viewYear,  setViewYear]  = useState(today.getFullYear());

  // Sheet modal
  const [sheetModal,   setSheetModal]   = useState<'add' | 'edit' | null>(null);
  const [editingSheet, setEditingSheet] = useState<DailySheet | null>(null);
  const [sheetForm,    setSheetForm]    = useState(EMPTY_SHEET);
  const [savingSheet,  setSavingSheet]  = useState(false);
  const [sheetError,   setSheetError]   = useState('');

  // Edit driver modal
  const [editDriverOpen, setEditDriverOpen] = useState(false);
  const [driverForm, setDriverForm] = useState({
    name: driver.name, phone: driver.phone, licenseNumber: driver.licenseNumber,
    startDate: driver.startDate ? driver.startDate.split('T')[0] : '',
  });
  const [savingDriver, setSavingDriver] = useState(false);
  const [driverError,  setDriverError]  = useState('');

  const currentAssignment = driver.assignments.find((a) => a.isActive) ?? null;

  // Filter sheets to this month/year
  const sheetsInMonth = useMemo(
    () => driver.dailySheets.filter((s) => s.month === viewMonth && s.year === viewYear),
    [driver.dailySheets, viewMonth, viewYear]
  );

  // Summary cards.
  // "Driver pay" = the settlement amount per shift (gross × 60% − expenses)
  // summed across all sheets in view. Can be negative (company owes driver)
  // or positive (driver owes company).
  const summary = useMemo(() => {
    const gross     = sheetsInMonth.reduce((s, x) => s + x.grossEarnings,      0);
    const driverPay = sheetsInMonth.reduce((s, x) => s + (x.companyNet ?? 0),   0);
    return { gross, driverPay };
  }, [sheetsInMonth]);

  // 10-day periods (3 cards for this month)
  const periodCards = useMemo(() => {
    return [1, 2, 3].map((periodNum) => {
      const period = periodNum as 1 | 2 | 3;
      const sheets = sheetsInMonth.filter((s) => s.payoutPeriod === period);
      const existing = driver.payouts.find((p) => p.payoutPeriod === period && p.month === viewMonth && p.year === viewYear) ?? null;
      const totals = {
        gross:     sheets.reduce((s, x) => s + x.grossEarnings,    0),
        driverPay: sheets.reduce((s, x) => s + (x.companyNet ?? 0), 0),
      };
      return { period, sheetCount: sheets.length, totals, existing };
    });
  }, [sheetsInMonth, driver.payouts, viewMonth, viewYear]);

  // Live pay breakdown for sheet modal
  const sheetPreview = useMemo(() => {
    return computePayBreakdown({
      grossEarnings:         parseNum(sheetForm.grossEarnings),
      gasDeduction:          parseNum(sheetForm.gasDeduction),
      debitFee:              parseNum(sheetForm.debitFee),
      debitTransactionCount: parseInt0(sheetForm.debitTransactionCount),
      callChargeDeduction:   parseNum(sheetForm.callChargeDeduction),
      extraExpenseDeduction: parseNum(sheetForm.extraExpenseDeduction),
    });
  }, [sheetForm]);

  async function refreshDriver() {
    const fresh = await fetch(`/api/drivers/${driver.id}`).then((r) => r.json());
    setDriver(fresh);
  }

  function openAddSheet() {
    setSheetForm({
      ...EMPTY_SHEET,
      vehicleNumber: currentAssignment?.vehicleNumber ?? '',
      shift:         currentAssignment?.shift ?? 'MORNING',
    });
    setEditingSheet(null);
    setSheetError('');
    setSheetModal('add');
  }

  function openEditSheet(s: DailySheet) {
    setSheetForm({
      date:                  s.date.split('T')[0],
      shift:                 s.shift,
      vehicleNumber:         s.vehicleNumber,
      grossEarnings:         String(s.grossEarnings),
      gasDeduction:          String(s.gasDeduction),
      debitFee:              String(s.debitFee),
      debitTransactionCount: String(s.debitTransactionCount),
      callChargeDeduction:   String(s.callChargeDeduction),
      extraExpenseDeduction: String(s.extraExpenseDeduction),
      extraExpenseNote:      s.extraExpenseNote,
    });
    setEditingSheet(s); setSheetError(''); setSheetModal('edit');
  }

  async function saveSheet() {
    setSavingSheet(true); setSheetError('');
    try {
      const payload = {
        vehicleNumber:         sheetForm.vehicleNumber,
        date:                  sheetForm.date,
        shift:                 sheetForm.shift,
        grossEarnings:         parseNum(sheetForm.grossEarnings),
        gasDeduction:          parseNum(sheetForm.gasDeduction),
        debitFee:              parseNum(sheetForm.debitFee),
        debitTransactionCount: parseInt0(sheetForm.debitTransactionCount),
        callChargeDeduction:   parseNum(sheetForm.callChargeDeduction),
        extraExpenseDeduction: parseNum(sheetForm.extraExpenseDeduction),
        extraExpenseNote:      sheetForm.extraExpenseNote,
      };
      const url    = sheetModal === 'edit' ? `/api/daily-sheets/${editingSheet!.id}` : `/api/drivers/${driver.id}/daily-sheets`;
      const method = sheetModal === 'edit' ? 'PUT' : 'POST';
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setSheetError(typeof data.error === 'string' ? data.error : 'Failed to save'); return; }
      await refreshDriver();
      setSheetModal(null);
    } catch { setSheetError('Network error'); }
    finally { setSavingSheet(false); }
  }

  async function deleteSheet(s: DailySheet) {
    if (!confirm(`Delete daily sheet for ${format(new Date(s.date), 'MMM d, yyyy')}?`)) return;
    const res = await fetch(`/api/daily-sheets/${s.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) await refreshDriver();
    else alert('Failed to delete.');
  }

  async function togglePaid(s: DailySheet) {
    const res = await fetch(`/api/daily-sheets/${s.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isPaid: !s.isPaid }),
    });
    if (res.ok) await refreshDriver();
  }

  async function generatePayout(period: 1 | 2 | 3) {
    const res = await fetch('/api/payouts', {
      method: 'POST', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ driverId: driver.id, payoutPeriod: period, month: viewMonth, year: viewYear }),
    });
    if (res.ok) await refreshDriver();
    else { const d = await res.json().catch(() => ({})); alert(d.error ?? 'Failed to generate payout'); }
  }

  async function markPayoutPaid(payoutId: string, nextStatus: 'DRAFT' | 'PAID') {
    const res = await fetch(`/api/payouts/${payoutId}/pay`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: nextStatus }),
    });
    if (res.ok) await refreshDriver();
  }

  async function saveDriver() {
    setSavingDriver(true); setDriverError('');
    try {
      const res = await fetch(`/api/drivers/${driver.id}`, {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(driverForm),
      });
      const data = await res.json();
      if (!res.ok) { setDriverError(typeof data.error === 'string' ? data.error : 'Failed'); return; }
      await refreshDriver();
      setEditDriverOpen(false);
    } catch { setDriverError('Network error'); }
    finally { setSavingDriver(false); }
  }

  // Month/year nav
  function shiftMonth(delta: number) {
    let m = viewMonth + delta;
    let y = viewYear;
    while (m < 1)  { m += 12; y -= 1; }
    while (m > 12) { m -= 12; y += 1; }
    setViewMonth(m); setViewYear(y);
  }
  const isCurrentMonth = viewMonth === today.getMonth() + 1 && viewYear === today.getFullYear();

  return (
    <>
      <PageHeader
        title={driver.name}
        description={`Driver since ${driver.startDate ? format(new Date(driver.startDate), 'MMM d, yyyy') : '—'}`}
        action={<Link href="/drivers"><span className="inline-flex items-center gap-1.5 text-sm font-medium text-indigo-600 hover:text-indigo-800">← All Drivers</span></Link>}
      />

      {/* Info card */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6">
        <div className="flex items-start justify-between gap-4">
          <div className="grid grid-cols-2 md:grid-cols-4 gap-x-8 gap-y-3 flex-1">
            <Info label="Phone"   value={driver.phone || '—'} />
            <Info label="License" value={driver.licenseNumber || '—'} mono />
            <Info label="Vehicle" value={currentAssignment ? `#${currentAssignment.vehicleNumber}` : '— Unassigned —'} mono />
            <div>
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">Shift</p>
              {currentAssignment
                ? <Badge variant={currentAssignment.shift === 'MORNING' ? 'morning' : 'evening'} />
                : <span className="text-gray-300 text-sm">—</span>}
            </div>
          </div>
          <div className="flex items-start gap-2 shrink-0">
            <Badge variant={driver.isActive ? 'active' : 'inactive'} />
            <Button size="sm" variant="ghost" onClick={() => { setDriverForm({
              name: driver.name, phone: driver.phone, licenseNumber: driver.licenseNumber,
              startDate: driver.startDate ? driver.startDate.split('T')[0] : '',
            }); setDriverError(''); setEditDriverOpen(true); }}>Edit</Button>
          </div>
        </div>
      </div>

      {/* Month nav */}
      <div className="flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Button size="sm" variant="ghost" onClick={() => shiftMonth(-1)}>←</Button>
          <div className="text-lg font-semibold text-gray-900">{MONTHS[viewMonth - 1]} {viewYear}</div>
          <Button size="sm" variant="ghost" onClick={() => shiftMonth(1)}>→</Button>
          {!isCurrentMonth && (
            <Button size="sm" variant="ghost" className="text-indigo-600 hover:bg-indigo-50 ml-2"
              onClick={() => { setViewMonth(today.getMonth() + 1); setViewYear(today.getFullYear()); }}>
              ← Back to current month
            </Button>
          )}
        </div>
        <div className="flex items-center gap-2">
          <Button
            variant="secondary"
            onClick={() => window.open(`/api/drivers/${driver.id}/report?month=${viewMonth}&year=${viewYear}`, '_blank')}
            disabled={sheetsInMonth.length === 0}
            title={sheetsInMonth.length === 0 ? 'No sheets to report this month' : `Download monthly report for ${MONTHS[viewMonth - 1]} ${viewYear}`}
          >
            Monthly Report
          </Button>
          <Button variant="primary" onClick={openAddSheet} disabled={!driver.isActive}>+ Add Daily Sheet</Button>
        </div>
      </div>

      {/* Summary cards — driver pay is the settlement amount (60% − expenses)
          summed across sheets; can be negative (company owes driver) or
          positive (driver owes company). */}
      <div className="grid grid-cols-2 gap-4">
        <SummaryCard label="Gross Earned" value={formatCurrency(summary.gross)} tone="indigo" />
        <SummaryCard
          label="Driver Pay"
          value={formatCurrency(summary.driverPay)}
          tone={summary.driverPay >= 0 ? 'emerald' : 'amber'}
        />
      </div>

      {/* Daily sheets table */}
      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <div className="overflow-x-auto">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Date', 'Shift', 'Cab', 'Gross', 'Driver Pay', 'Paid', ''].map((h) => (
                  <th key={h} className="px-3 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {sheetsInMonth.length === 0 ? (
                <tr><td colSpan={7} className="px-3 py-10 text-center text-sm text-gray-400">No daily sheets for {MONTHS[viewMonth - 1]} {viewYear}.</td></tr>
              ) : sheetsInMonth.map((s) => {
                return (
                  <tr key={s.id} className="group hover:bg-gray-50">
                    <td className="px-3 py-3 text-gray-700 whitespace-nowrap">{format(new Date(s.date), 'MMM d')}</td>
                    <td className="px-3 py-3"><Badge variant={s.shift === 'MORNING' ? 'morning' : 'evening'} /></td>
                    <td className="px-3 py-3 font-mono font-bold text-gray-900">#{s.vehicleNumber}</td>
                    <td className="px-3 py-3 text-gray-900 whitespace-nowrap">{formatCurrency(s.grossEarnings)}</td>
                    <td className={`px-3 py-3 font-semibold whitespace-nowrap ${(s.companyNet ?? 0) >= 0 ? 'text-emerald-600' : 'text-red-600'}`}
                        title={`60% (${formatCurrency(s.grossEarnings * 0.6)}) − debit ${formatCurrency(Math.max(s.debitFee - s.debitTransactionCount, 0))} (${formatCurrency(s.debitFee)} − ${s.debitTransactionCount} txn) − gas ${formatCurrency(s.gasDeduction)} − call ${formatCurrency(s.callChargeDeduction)} − extra ${formatCurrency(s.extraExpenseDeduction)}`}>
                      {formatCurrency(s.companyNet ?? 0)}
                    </td>
                    <td className="px-3 py-3">
                      <button onClick={() => togglePaid(s)} className="cursor-pointer">
                        <Badge variant={s.isPaid ? 'paid' : 'pending'} />
                      </button>
                    </td>
                    <td className="px-3 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" onClick={() => openEditSheet(s)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteSheet(s)}
                          className="text-red-500 hover:bg-red-50">Delete</Button>
                      </div>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 10-day payout cards */}
      <div>
        <h3 className="text-sm font-bold uppercase tracking-widest text-gray-400 mb-3">10-Day Payouts — {MONTHS[viewMonth - 1]} {viewYear}</h3>
        <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
          {periodCards.map(({ period, sheetCount, totals, existing }) => (
            <div key={period} className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-5">
              <div className="flex items-start justify-between mb-3">
                <div>
                  <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">Period {period}</p>
                  <p className="text-sm font-semibold text-gray-900 mt-0.5">{formatPeriodLabel(period, viewMonth, viewYear)}</p>
                </div>
                {existing && <Badge variant={existing.status === 'PAID' ? 'paid' : 'draft'} />}
              </div>

              <div className="space-y-1.5 text-sm">
                <div className="flex justify-between">
                  <span className="text-gray-500">Sheets</span>
                  <span className="font-medium text-gray-700">{sheetCount}</span>
                </div>
                <div className="flex justify-between">
                  <span className="text-gray-500">Gross</span>
                  <span className="font-medium text-gray-700">{formatCurrency(totals.gross)}</span>
                </div>
                <div className="flex justify-between border-t border-gray-100 pt-1.5 mt-1.5">
                  <span className="font-semibold text-gray-900">Driver Pay</span>
                  <span className={`font-bold ${totals.driverPay >= 0 ? 'text-emerald-600' : 'text-red-600'}`}>
                    {formatCurrency(totals.driverPay)}
                  </span>
                </div>
              </div>

              <div className="flex gap-2 mt-4">
                {!existing ? (
                  <Button variant="primary" size="sm" className="w-full" onClick={() => generatePayout(period)} disabled={sheetCount === 0}>
                    {sheetCount === 0 ? 'No sheets' : 'Generate Report'}
                  </Button>
                ) : (
                  <>
                    <Button variant="secondary" size="sm" className="flex-1"
                      onClick={() => window.open(`/api/payouts/${existing.id}/pdf`, '_blank')}>
                      PDF
                    </Button>
                    {existing.status === 'DRAFT' ? (
                      <Button variant="primary" size="sm" className="flex-1" onClick={() => markPayoutPaid(existing.id, 'PAID')}>
                        Mark Paid
                      </Button>
                    ) : (
                      <Button variant="ghost" size="sm" className="flex-1 text-amber-600" onClick={() => markPayoutPaid(existing.id, 'DRAFT')}>
                        Reopen
                      </Button>
                    )}
                    <Button variant="ghost" size="sm" onClick={() => generatePayout(period)} title="Recompute from current sheets">↻</Button>
                  </>
                )}
              </div>
            </div>
          ))}
        </div>
      </div>

      {/* Add / Edit Sheet Modal */}
      <Modal open={sheetModal !== null} onClose={() => setSheetModal(null)}
        title={sheetModal === 'edit' ? 'Edit Daily Sheet' : 'Add Daily Sheet'} size="lg">
        <div className="grid grid-cols-2 gap-4">
          <Input label="Date" type="date"
            value={sheetForm.date}
            onChange={(e) => setSheetForm((f) => ({ ...f, date: e.target.value }))}
          />
          <Select label="Shift"
            value={sheetForm.shift}
            onChange={(e) => setSheetForm((f) => ({ ...f, shift: e.target.value as any }))}>
            <option value="MORNING">Morning (5am – 5pm)</option>
            <option value="EVENING">Evening (5pm – 5am)</option>
          </Select>
          <Input label="Cab Number" placeholder="e.g. 30"
            value={sheetForm.vehicleNumber}
            onChange={(e) => setSheetForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
          />
          <Input label="Gross Earnings ($)" type="number" min={0} step={0.01} placeholder="0.00"
            value={sheetForm.grossEarnings}
            onChange={(e) => setSheetForm((f) => ({ ...f, grossEarnings: e.target.value }))}
            hint="Total take — this is the 100%"
          />
          <Input label="Debit Amount ($)" type="number" min={0} step={0.01} placeholder="0.00"
            value={sheetForm.debitFee}
            onChange={(e) => setSheetForm((f) => ({ ...f, debitFee: e.target.value }))}
            hint="Settlement total from the terminal receipt"
          />
          <Input label="Debit Txn Count" type="number" min={0} step={1} placeholder="0"
            value={sheetForm.debitTransactionCount}
            onChange={(e) => setSheetForm((f) => ({ ...f, debitTransactionCount: e.target.value }))}
            hint={
              (parseInt0(sheetForm.debitTransactionCount) > 0 && parseNum(sheetForm.debitFee) > 0)
                ? `Debit expense: ${formatCurrency(parseNum(sheetForm.debitFee))} − ${sheetForm.debitTransactionCount} = ${formatCurrency(Math.max(parseNum(sheetForm.debitFee) - parseInt0(sheetForm.debitTransactionCount), 0))} (from 60%)`
                : "$1/txn subtracted from debit amount"
            }
          />
          <Input label="Gas ($)" type="number" min={0} step={0.01} placeholder="0.00"
            value={sheetForm.gasDeduction}
            onChange={(e) => setSheetForm((f) => ({ ...f, gasDeduction: e.target.value }))}
            hint="Company expense (from 60%)"
          />
          <Input label="Call Charge ($)" type="number" min={0} step={0.01} placeholder="0.00"
            value={sheetForm.callChargeDeduction}
            onChange={(e) => setSheetForm((f) => ({ ...f, callChargeDeduction: e.target.value }))}
            hint="Company expense (from 60%)"
          />
          <Input label="Extra Expense ($)" type="number" min={0} step={0.01} placeholder="0.00"
            value={sheetForm.extraExpenseDeduction}
            onChange={(e) => setSheetForm((f) => ({ ...f, extraExpenseDeduction: e.target.value }))}
            hint="Company expense (from 60%)"
          />
          <div className="col-span-2">
            <Input label="Extra Expense Note (optional)" placeholder="e.g. car wash"
              value={sheetForm.extraExpenseNote}
              onChange={(e) => setSheetForm((f) => ({ ...f, extraExpenseNote: e.target.value }))}
            />
          </div>
        </div>

        {/* Live preview — full breakdown */}
        <div className="mt-4 rounded-xl bg-indigo-50 border border-indigo-100 p-4">
          <p className="text-xs font-bold uppercase tracking-widest text-indigo-400 mb-3">Live Calculation</p>
          <div className="grid grid-cols-2 gap-x-6 gap-y-1.5 text-sm">
            <span className="text-gray-600">Gross (100%)</span>
            <span className="text-right text-gray-900 font-medium">{formatCurrency(sheetPreview.gross)}</span>

            <span className="text-emerald-700 font-semibold border-t border-indigo-200 pt-1.5 mt-1">Driver pay (40%)</span>
            <span className="text-right text-emerald-600 font-bold text-lg border-t border-indigo-200 pt-1.5 mt-1">{formatCurrency(sheetPreview.driverPay)}</span>

            <span className="text-gray-500 text-xs mt-2">Company share (60%)</span>
            <span className="text-right text-gray-600 text-xs mt-2">{formatCurrency(sheetPreview.companyShare)}</span>

            {sheetPreview.companyExpenses > 0 && (
              <>
                <span className="text-gray-500 text-xs">
                  {sheetPreview.debitFeeTotal > 0 && <>− Debit {formatCurrency(sheetPreview.debitFeeTotal)} </>}
                  {sheetPreview.gas > 0            && <>− Gas {formatCurrency(sheetPreview.gas)} </>}
                  {sheetPreview.callCharge > 0     && <>− Call {formatCurrency(sheetPreview.callCharge)} </>}
                  {sheetPreview.extra > 0          && <>− Extra {formatCurrency(sheetPreview.extra)}</>}
                </span>
                <span className="text-right text-amber-700 text-xs">−{formatCurrency(sheetPreview.companyExpenses)}</span>
              </>
            )}

            <span className="text-slate-700 font-semibold border-t border-indigo-200 pt-1.5">Company net</span>
            <span className={`text-right font-bold border-t border-indigo-200 pt-1.5 ${sheetPreview.companyNet >= 0 ? 'text-slate-900' : 'text-red-600'}`}>
              {formatCurrency(sheetPreview.companyNet)}
            </span>
          </div>
        </div>

        {sheetError && <p className="mt-3 rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{sheetError}</p>}
        <div className="flex justify-end gap-2 mt-4">
          <Button variant="ghost" onClick={() => setSheetModal(null)}>Cancel</Button>
          <Button variant="primary" onClick={saveSheet}
            disabled={savingSheet || !sheetForm.date || !sheetForm.vehicleNumber || !sheetForm.grossEarnings}>
            {savingSheet ? 'Saving…' : sheetModal === 'edit' ? 'Save Changes' : 'Add Daily Sheet'}
          </Button>
        </div>
      </Modal>

      {/* Edit Driver Modal */}
      <Modal open={editDriverOpen} onClose={() => setEditDriverOpen(false)} title={`Edit ${driver.name}`}>
        <div className="space-y-4">
          <Input label="Name" value={driverForm.name}
            onChange={(e) => setDriverForm((f) => ({ ...f, name: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" value={driverForm.phone}
              onChange={(e) => setDriverForm((f) => ({ ...f, phone: e.target.value }))} />
            <Input label="License #" value={driverForm.licenseNumber}
              onChange={(e) => setDriverForm((f) => ({ ...f, licenseNumber: e.target.value }))} />
          </div>
          <Input label="Start Date" type="date" value={driverForm.startDate}
            onChange={(e) => setDriverForm((f) => ({ ...f, startDate: e.target.value }))} />
          {driverError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{driverError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setEditDriverOpen(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveDriver} disabled={savingDriver || !driverForm.name}>
              {savingDriver ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function Info({ label, value, mono }: { label: string; value: string; mono?: boolean }) {
  return (
    <div>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400 mb-1">{label}</p>
      <p className={`text-sm font-semibold text-gray-900 ${mono ? 'font-mono' : ''}`}>{value}</p>
    </div>
  );
}

function SummaryCard({ label, value, tone, small }: {
  label: string; value: string; tone: 'indigo' | 'emerald' | 'amber' | 'slate'; small?: boolean;
}) {
  const tones = {
    indigo:  'text-indigo-600',
    emerald: 'text-emerald-600',
    amber:   'text-amber-600',
    slate:   'text-slate-700',
  };
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`mt-1 font-bold ${tones[tone]} ${small ? 'text-lg' : 'text-2xl'}`}>{value}</p>
    </div>
  );
}
