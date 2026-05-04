'use client';
import { useState, useRef } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { MONTHS, YEARS } from '@/lib/constants';
import { formatCurrency } from '@/lib/tax';

interface Company { id: string; companyName: string; accountId: string; }
interface Ride {
  id: string; companyId: string; month: string; year: number;
  jobId: string; vehicleNumber: string; pickupLocation: string;
  dropoffLocation: string; passenger: string; driver: string;
  customerPhone: string;
  dateTime: string; amount: number; invoiceId: string | null;
  company: { companyName: string; accountId: string };
}

const EMPTY_RIDE = { companyId: '', month: '', year: new Date().getFullYear(), jobId: '', vehicleNumber: '', pickupLocation: '', dropoffLocation: '', passenger: '', driver: '', customerPhone: '', dateTime: '', amount: 0 };

export default function RidesClient({ initialRides, companies }: { initialRides: Ride[]; companies: Company[] }) {
  const [rides, setRides]           = useState<Ride[]>(initialRides);
  const [modal, setModal]           = useState<'add' | 'import' | null>(null);
  const [editingRide, setEditingRide] = useState<Ride | null>(null);
  const [form, setForm]             = useState({ ...EMPTY_RIDE });
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [importForm, setImportForm] = useState({ companyId: '', month: String(MONTHS[new Date().getMonth()]), year: new Date().getFullYear() });
  const [importResult, setImportResult] = useState<string | null>(null);
  const fileRef = useRef<HTMLInputElement>(null);

  // Filters
  const [filterCompany, setFilterCompany] = useState('');
  const [filterMonth,   setFilterMonth]   = useState('');

  const filtered = rides.filter((r) => {
    if (filterCompany && r.companyId !== filterCompany) return false;
    if (filterMonth   && r.month     !== filterMonth)   return false;
    return true;
  });

  function field(key: keyof typeof EMPTY_RIDE) {
    return {
      value: String(form[key]),
      onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) =>
        setForm((f) => ({ ...f, [key]: ['amount', 'year'].includes(key) ? parseFloat(e.target.value) || 0 : e.target.value })),
    };
  }

  async function saveRide() {
    setSaving(true); setError('');
    try {
      if (editingRide) {
        // Edit existing ride
        const res = await fetch(`/api/rides/${editingRide.id}`, {
          method: 'PUT', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            jobId: form.jobId, vehicleNumber: form.vehicleNumber,
            pickupLocation: form.pickupLocation, dropoffLocation: form.dropoffLocation,
            passenger: form.passenger, driver: form.driver,
            customerPhone: form.customerPhone,
            dateTime: form.dateTime, amount: form.amount,
            month: form.month, year: form.year,
          }),
        });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed'); return; }
        setRides((prev) => prev.map((r) => r.id === editingRide.id ? { ...r, ...data } : r));
      } else {
        // Add new ride
        const res = await fetch('/api/rides', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
        const data = await res.json();
        if (!res.ok) { setError(data.error ?? 'Failed'); return; }
        const co = companies.find((c) => c.id === form.companyId);
        setRides((prev) => [{ ...data, invoiceId: null, company: { companyName: co?.companyName ?? '', accountId: co?.accountId ?? '' } }, ...prev]);
      }
      setModal(null); setEditingRide(null);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  function openEditRide(ride: Ride) {
    setEditingRide(ride);
    setForm({
      companyId: ride.companyId, month: ride.month, year: ride.year,
      jobId: ride.jobId, vehicleNumber: ride.vehicleNumber,
      pickupLocation: ride.pickupLocation, dropoffLocation: ride.dropoffLocation,
      passenger: ride.passenger, driver: ride.driver,
      customerPhone: ride.customerPhone ?? '',
      dateTime: ride.dateTime, amount: ride.amount,
    });
    setError('');
    setModal('add');
  }

  async function deleteRide(id: string) {
    if (!confirm('Delete this ride?')) return;
    const res = await fetch(`/api/rides/${id}`, { method: 'DELETE' });
    if (!res.ok) { alert('Delete failed — please try again.'); return; }
    setRides((prev) => prev.filter((r) => r.id !== id));
  }

  async function handleImport() {
    const file = fileRef.current?.files?.[0];
    if (!file) { setError('Select a file first'); return; }
    setSaving(true); setError(''); setImportResult(null);

    try {
      // Parse the Excel/CSV file client-side using xlsx
      const { read, utils } = await import('xlsx');
      const buffer = await file.arrayBuffer();
      const wb = read(buffer);
      const ws = wb.Sheets[wb.SheetNames[0]];
      const rawRows: any[] = utils.sheet_to_json(ws, { defval: '' });

      // Map columns: try common header names
      const allMapped = rawRows.map((row) => ({
        jobId:           String(row['Job ID'] ?? row['JobID'] ?? row['job_id'] ?? ''),
        vehicleNumber:   String(row['Vehicle #'] ?? row['Vehicle'] ?? row['Cab #'] ?? row['vehicleNumber'] ?? ''),
        pickupLocation:  String(row['Pickup'] ?? row['Pickup Location'] ?? row['pickupLocation'] ?? ''),
        dropoffLocation: String(row['Dropoff'] ?? row['Dropoff Location'] ?? row['dropoffLocation'] ?? ''),
        passenger:       String(row['Passenger'] ?? row['passenger'] ?? ''),
        driver:          String(row['Driver']    ?? row['driver']    ?? ''),
        customerPhone:   String(row['Phone'] ?? row['Customer Phone'] ?? row['customerPhone'] ?? ''),
        dateTime:        String(row['Date/Time'] ?? row['Date'] ?? row['dateTime'] ?? ''),
        amount:          parseFloat(String(row['Amount'] ?? row['amount'] ?? '0')) || 0,
      }));
      const rows = allMapped.filter((r) => r.amount > 0);
      const skipped = allMapped.length - rows.length;

      if (rows.length === 0) { setError('No valid rows found. Check column headers.'); return; }

      const res  = await fetch('/api/rides/import', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...importForm, rows }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Import failed'); return; }

      const skippedMsg = skipped > 0 ? ` (${skipped} row${skipped > 1 ? 's' : ''} skipped — zero amount)` : '.';
      setImportResult(`Successfully imported ${data.imported} ride${data.imported !== 1 ? 's' : ''}${skippedMsg} Filter set to show only the imported batch — use Edit/Delete on each row, or change Month/Year if you imported into the wrong period.`);
      // Refresh rides
      const updated = await fetch(`/api/rides?companyId=${importForm.companyId}&month=${importForm.month}&year=${importForm.year}`).then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
      setRides((prev) => [...updated.filter((r: Ride) => !prev.some((p) => p.id === r.id)), ...prev]);
      // Auto-filter to the imported batch so the user immediately sees what landed.
      setFilterCompany(importForm.companyId);
      setFilterMonth(importForm.month);
    } catch (e) { setError(String(e)); }
    finally { setSaving(false); }
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Rides"
          description={filtered.length < rides.length ? `Showing ${filtered.length} of ${rides.length} rides` : `${rides.length} rides total`}
          action={
            <div className="flex gap-2">
              <Button variant="secondary" onClick={() => { setImportResult(null); setError(''); setModal('import'); }}>Import Excel / CSV</Button>
              <Button variant="primary" onClick={() => { setEditingRide(null); setForm({ ...EMPTY_RIDE }); setError(''); setModal('add'); }}>+ Add Ride</Button>
            </div>
          }
        />

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={filterCompany} onChange={(e) => setFilterCompany(e.target.value)} className="w-48">
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Select>
          <Select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-36">
            <option value="">All Months</option>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
            <p className="text-base font-semibold text-gray-900">No rides found</p>
            <p className="mt-1 text-sm text-gray-500">Add rides manually or import from Excel / CSV.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Trip ID', 'Date/Time', 'Company', 'Month', 'Pickup', 'Dropoff', 'Phone', 'Cab #', 'Amount', 'Status', ''].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((r) => (
                  <tr key={r.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 text-sm text-gray-700 font-mono">{r.jobId || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600">{r.dateTime || '—'}</td>
                    <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{r.company.companyName}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-500">{r.month} {r.year}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 max-w-[140px] truncate">{r.pickupLocation || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 max-w-[140px] truncate">{r.dropoffLocation || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 font-mono whitespace-nowrap">{r.customerPhone || '—'}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 font-mono">{r.vehicleNumber || '—'}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{formatCurrency(r.amount)}</td>
                    <td className="px-4 py-3.5">
                      {r.invoiceId
                        ? <span className="inline-flex items-center rounded-full bg-emerald-50 px-2 py-0.5 text-xs font-medium text-emerald-700">Invoiced</span>
                        : <span className="inline-flex items-center rounded-full bg-gray-100 px-2 py-0.5 text-xs font-medium text-gray-500">Uninvoiced</span>
                      }
                    </td>
                    <td className="px-4 py-3.5">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100">
                        <Button size="sm" variant="ghost" onClick={() => openEditRide(r)} className="text-indigo-500 hover:text-indigo-700 hover:bg-indigo-50">Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteRide(r.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add / Edit Ride Modal */}
      <Modal open={modal === 'add'} onClose={() => { setModal(null); setEditingRide(null); }} title={editingRide ? 'Edit Ride' : 'Add Ride'} size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div className="col-span-2">
              <Select label="Company" {...field('companyId')} disabled={!!editingRide}>
                <option value="">Select company…</option>
                {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </Select>
            </div>
            <Select label="Month" {...field('month')}>
              <option value="">Select month…</option>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select label="Year" {...field('year')}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          {editingRide && (
            <p className="text-xs text-gray-400 -mt-2">Company cannot be changed. Month/Year can be corrected if a ride was imported into the wrong period.</p>
          )}
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date / Time" placeholder="2025-01-15 14:30" {...field('dateTime')} />
            <Input label="Job ID" placeholder="JOB-001" {...field('jobId')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Pickup Location" placeholder="123 Main St" {...field('pickupLocation')} />
            <Input label="Dropoff Location" placeholder="456 Oak Ave" {...field('dropoffLocation')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Customer Phone" placeholder="+1 705 555 0123" {...field('customerPhone')} />
            <Input label="Cab / Vehicle #" placeholder="CAB-01" {...field('vehicleNumber')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Passenger" placeholder="John Doe" {...field('passenger')} />
            <Input label="Driver" placeholder="Driver Name" {...field('driver')} />
          </div>
          <Input label="Amount ($, tax-inclusive)" type="number" step="0.01" min="0" {...field('amount')} />
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => { setModal(null); setEditingRide(null); }}>Cancel</Button>
            <Button variant="primary" onClick={saveRide} disabled={saving || !form.companyId || !form.month}>
              {saving ? 'Saving…' : editingRide ? 'Save Changes' : 'Add Ride'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Import Modal */}
      <Modal open={modal === 'import'} onClose={() => setModal(null)} title="Import Rides from Excel / CSV" size="md">
        <div className="space-y-4">
          <Select label="Company" value={importForm.companyId} onChange={(e) => setImportForm((f) => ({ ...f, companyId: e.target.value }))}>
            <option value="">Select company…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Month" value={importForm.month} onChange={(e) => setImportForm((f) => ({ ...f, month: e.target.value }))}>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select label="Year" value={importForm.year} onChange={(e) => setImportForm((f) => ({ ...f, year: parseInt(e.target.value) }))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
          <div>
            <label className="text-sm font-medium text-gray-700 block mb-1.5">Excel or CSV File</label>
            <input ref={fileRef} type="file" accept=".xlsx,.xls,.csv" className="block w-full text-sm text-gray-600 file:mr-4 file:py-2 file:px-4 file:rounded-lg file:border-0 file:text-sm file:font-medium file:bg-indigo-50 file:text-indigo-700 hover:file:bg-indigo-100" />
          </div>
          <p className="text-xs text-gray-500 rounded-lg bg-gray-50 px-3 py-2">
            Expected columns: <code className="font-mono">Job ID, Vehicle #, Pickup, Dropoff, Passenger, Driver, Date/Time, Amount</code>
          </p>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {importResult && <p className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">{importResult}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Done</Button>
            <Button variant="primary" onClick={handleImport} disabled={saving || !importForm.companyId}>{saving ? 'Importing…' : 'Import'}</Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
