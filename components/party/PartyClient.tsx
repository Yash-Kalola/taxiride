'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { format } from 'date-fns';

interface PartyBooking {
  id: string;
  customerName: string;
  customerPhone: string;
  customerEmail: string;
  eventDate: string;
  pickupTime: string;
  pickupLocation: string;
  dropoffLocation: string;
  passengers: number;
  vehiclesNeeded: number;
  quotedAmount: number;
  status: 'BOOKED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';
  notes: string;
  companyId: string | null;
  company: { id: string; companyName: string } | null;
}

interface Company {
  id: string;
  companyName: string;
}

type PartyFormStatus = 'BOOKED' | 'CONFIRMED' | 'COMPLETED' | 'CANCELLED';

interface PartyForm {
  customerName: string; customerPhone: string; customerEmail: string;
  eventDate: string; pickupTime: string; pickupLocation: string; dropoffLocation: string;
  passengers: number; vehiclesNeeded: number; quotedAmount: number;
  status: PartyFormStatus; notes: string; companyId: string;
}

const EMPTY: PartyForm = {
  customerName: '', customerPhone: '', customerEmail: '',
  eventDate: '', pickupTime: '', pickupLocation: '', dropoffLocation: '',
  passengers: 1, vehiclesNeeded: 1, quotedAmount: 0,
  status: 'BOOKED', notes: '', companyId: '',
};

const STATUS_COLORS: Record<string, string> = {
  BOOKED:    'bg-blue-50 text-blue-700 ring-blue-200',
  CONFIRMED: 'bg-emerald-50 text-emerald-700 ring-emerald-200',
  COMPLETED: 'bg-gray-100 text-gray-600 ring-gray-200',
  CANCELLED: 'bg-red-50 text-red-600 ring-red-200',
};

export default function PartyClient({
  initialBookings,
  companies,
}: {
  initialBookings: PartyBooking[];
  companies: Company[];
}) {
  const [bookings, setBookings] = useState<PartyBooking[]>(initialBookings);
  const [modal, setModal]       = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing]   = useState<PartyBooking | null>(null);
  const [form, setForm]         = useState<PartyForm>(EMPTY);
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState('');
  const [deleteId, setDeleteId] = useState<string | null>(null);
  const [filter, setFilter]     = useState<string>('ALL');

  function openAdd() {
    setForm(EMPTY);
    setEditing(null);
    setError('');
    setModal('add');
  }

  function openEdit(b: PartyBooking) {
    setForm({
      customerName: b.customerName,
      customerPhone: b.customerPhone,
      customerEmail: b.customerEmail,
      eventDate: b.eventDate ? format(new Date(b.eventDate), 'yyyy-MM-dd') : '',
      pickupTime: b.pickupTime,
      pickupLocation: b.pickupLocation,
      dropoffLocation: b.dropoffLocation,
      passengers: b.passengers,
      vehiclesNeeded: b.vehiclesNeeded,
      quotedAmount: b.quotedAmount,
      status: b.status,
      notes: b.notes,
      companyId: b.companyId ?? '',
    });
    setEditing(b);
    setError('');
    setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const url    = modal === 'edit' ? `/api/party/${editing!.id}` : '/api/party';
      const method = modal === 'edit' ? 'PUT' : 'POST';
      const payload = { ...form, companyId: form.companyId || null };
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error)); return; }
      // Refresh
      const updated = await fetch('/api/party').then(r => r.json());
      setBookings(updated);
      setModal(null);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  async function confirmDelete(id: string) {
    try {
      const res = await fetch(`/api/party/${id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        setBookings(prev => prev.filter(b => b.id !== id));
      } else {
        alert('Delete failed');
      }
    } catch { alert('Network error'); }
    setDeleteId(null);
  }

  async function quickStatus(id: string, status: string) {
    try {
      const res = await fetch(`/api/party/${id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ status }),
      });
      if (res.ok) {
        const data = await res.json();
        setBookings(prev => prev.map(b => b.id === id ? { ...b, ...data } : b));
      }
    } catch { /* silent */ }
  }

  const filtered = filter === 'ALL' ? bookings : bookings.filter(b => b.status === filter);

  const upcoming = bookings.filter(b => b.status === 'BOOKED' || b.status === 'CONFIRMED').length;

  return (
    <>
      <PageHeader
        title="Party Bookings"
        description={`${bookings.length} total · ${upcoming} upcoming`}
        action={<Button variant="primary" onClick={openAdd}>+ New Booking</Button>}
      />

      {/* Filter bar */}
      <div className="flex items-center gap-3">
        <Select value={filter} onChange={e => setFilter(e.target.value)} className="w-40">
          <option value="ALL">All Statuses</option>
          <option value="BOOKED">Booked</option>
          <option value="CONFIRMED">Confirmed</option>
          <option value="COMPLETED">Completed</option>
          <option value="CANCELLED">Cancelled</option>
        </Select>
        <p className="text-sm text-gray-400">{filtered.length} booking{filtered.length !== 1 ? 's' : ''}</p>
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-purple-50">
            <svg className="h-7 w-7 text-purple-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M12 8.25v-1.5m0 1.5c-1.355 0-2.697.056-4.024.166C6.845 8.51 6 9.473 6 10.608v2.513m6-4.871c1.355 0 2.697.056 4.024.166C17.155 8.51 18 9.473 18 10.608v2.513M15 8.25v-1.5m-6 1.5v-1.5m12 9.75l-1.5.75a3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0 3.354 3.354 0 00-3 0 3.354 3.354 0 01-3 0L3 16.5m15-3.379a48.474 48.474 0 00-6-.371c-2.032 0-4.034.126-6 .371m12 0c.39.049.777.102 1.163.16 1.07.16 1.837 1.094 1.837 2.175v5.169c0 .621-.504 1.125-1.125 1.125H4.125A1.125 1.125 0 013 20.625v-5.17c0-1.08.768-2.014 1.837-2.174A47.78 47.78 0 016 13.12M12.265 3.11a.375.375 0 11-.53 0L12 2.845l.265.265zm-3 0a.375.375 0 11-.53 0L9 2.845l.265.265zm6 0a.375.375 0 11-.53 0L15 2.845l.265.265z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-900">No bookings yet</p>
          <p className="mt-1 text-sm text-gray-500">Create your first party booking.</p>
          <Button variant="primary" className="mt-5" onClick={openAdd}>+ New Booking</Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Customer', 'Event Date', 'Pickup', 'Dropoff', 'Pax', 'Amount', 'Status', ''].map(h => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map(b => (
                <tr key={b.id} className="group hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-sm text-gray-900">{b.customerName}</p>
                    <p className="text-xs text-gray-400 mt-0.5">{b.customerPhone || b.customerEmail || '—'}</p>
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-700">
                    {format(new Date(b.eventDate), 'MMM d, yyyy')}
                    {b.pickupTime && <span className="text-gray-400 ml-1">@ {b.pickupTime}</span>}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-600 max-w-[150px] truncate">{b.pickupLocation || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600 max-w-[150px] truncate">{b.dropoffLocation || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-700 font-medium">{b.passengers}</td>
                  <td className="px-5 py-4 text-sm font-semibold text-gray-900">${b.quotedAmount.toFixed(2)}</td>
                  <td className="px-5 py-4">
                    <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-semibold ring-1 ring-inset ${STATUS_COLORS[b.status]}`}>
                      {b.status}
                    </span>
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      {b.status === 'BOOKED' && (
                        <Button size="sm" variant="ghost" onClick={() => quickStatus(b.id, 'CONFIRMED')} className="text-emerald-600">Confirm</Button>
                      )}
                      {(b.status === 'BOOKED' || b.status === 'CONFIRMED') && (
                        <Button size="sm" variant="ghost" onClick={() => quickStatus(b.id, 'COMPLETED')} className="text-gray-600">Complete</Button>
                      )}
                      <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(b.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">Del</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Booking' : 'New Party Booking'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Customer Name" placeholder="John Smith" value={form.customerName} onChange={e => setForm(f => ({ ...f, customerName: e.target.value }))} />
            <Input label="Phone" placeholder="+1 705 555 0000" value={form.customerPhone} onChange={e => setForm(f => ({ ...f, customerPhone: e.target.value }))} />
          </div>
          <Input label="Email" type="email" placeholder="customer@email.com" value={form.customerEmail} onChange={e => setForm(f => ({ ...f, customerEmail: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Event Date" type="date" value={form.eventDate} onChange={e => setForm(f => ({ ...f, eventDate: e.target.value }))} />
            <Input label="Pickup Time" type="time" value={form.pickupTime} onChange={e => setForm(f => ({ ...f, pickupTime: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Pickup Location" placeholder="123 Main St" value={form.pickupLocation} onChange={e => setForm(f => ({ ...f, pickupLocation: e.target.value }))} />
            <Input label="Dropoff Location" placeholder="456 Oak Ave" value={form.dropoffLocation} onChange={e => setForm(f => ({ ...f, dropoffLocation: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Passengers" type="number" min={1} value={String(form.passengers)} onChange={e => setForm(f => ({ ...f, passengers: parseInt(e.target.value) || 1 }))} />
            <Input label="Vehicles Needed" type="number" min={1} value={String(form.vehiclesNeeded)} onChange={e => setForm(f => ({ ...f, vehiclesNeeded: parseInt(e.target.value) || 1 }))} />
            <Input label="Quoted Amount ($)" type="number" min={0} step="0.01" value={String(form.quotedAmount)} onChange={e => setForm(f => ({ ...f, quotedAmount: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Status</label>
              <Select value={form.status} onChange={e => setForm(f => ({ ...f, status: e.target.value as PartyFormStatus }))}>
                <option value="BOOKED">Booked</option>
                <option value="CONFIRMED">Confirmed</option>
                <option value="COMPLETED">Completed</option>
                <option value="CANCELLED">Cancelled</option>
              </Select>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Company (optional)</label>
              <Select value={form.companyId} onChange={e => setForm(f => ({ ...f, companyId: e.target.value }))}>
                <option value="">— None —</option>
                {companies.map(c => <option key={c.id} value={c.id}>{c.companyName}</option>)}
              </Select>
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={form.notes}
              onChange={e => setForm(f => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Special requests, vehicle type, etc."
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving...' : 'Save Booking'}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Booking" size="sm">
        <p className="text-sm text-gray-600 mb-5">This will permanently delete this booking. This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirmDelete(deleteId!)}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}
