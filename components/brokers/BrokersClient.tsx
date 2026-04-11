'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';

interface Transaction {
  id: string; brokerId: string; type: string; amount: number;
  status: string; dueDate: string | null; paidDate: string | null;
  description: string; month: number; year: number; createdAt: string;
}

interface Broker {
  id: string; name: string; phone: string; billingDay: number;
  startDate: string; endDate: string | null; isActive: boolean;
  transactions: Transaction[];
  vehicles: { id: string }[];
}

type FilterStatus = 'active' | 'inactive' | 'all';
type ModalMode = 'add' | 'edit' | null;

const EMPTY_FORM = { name: '', phone: '', billingDay: '1', startDate: '' };

function owedToUs(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type !== 'PAYOUT' && t.status === 'PENDING')
    .reduce((s, t) => s + t.amount, 0);
}

function weOweThem(transactions: Transaction[]): number {
  return transactions
    .filter((t) => t.type === 'PAYOUT' && t.status === 'PENDING')
    .reduce((s, t) => s + t.amount, 0);
}

export default function BrokersClient({ initialBrokers }: { initialBrokers: Broker[] }) {
  const [brokers,       setBrokers]     = useState<Broker[]>(initialBrokers);
  const [modal,         setModal]       = useState<ModalMode>(null);
  const [editing,       setEditing]     = useState<Broker | null>(null);
  const [form,          setForm]        = useState(EMPTY_FORM);
  const [saving,        setSaving]      = useState(false);
  const [error,         setError]       = useState('');
  const [filterStatus,  setFilter]      = useState<FilterStatus>('active');
  const [deleteId,      setDeleteId]    = useState<string | null>(null);

  const filtered = useMemo(() => {
    if (filterStatus === 'all') return brokers;
    return brokers.filter((b) => filterStatus === 'active' ? b.isActive : !b.isActive);
  }, [brokers, filterStatus]);

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setError(''); setModal('add');
  }
  function openEdit(b: Broker) {
    setForm({
      name: b.name, phone: b.phone,
      billingDay: String(b.billingDay ?? 1),
      startDate: b.startDate ? b.startDate.split('T')[0] : '',
    });
    setEditing(b); setError(''); setModal('edit');
  }

  const field = (key: keyof typeof EMPTY_FORM) => ({
    value: form[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: e.target.value })),
  });

  async function save() {
    setSaving(true); setError('');
    try {
      const url    = modal === 'edit' ? `/api/brokers/${editing!.id}` : '/api/brokers';
      const method = modal === 'edit' ? 'PUT' : 'POST';
      const payload = { ...form, billingDay: parseInt(form.billingDay) || 1 };
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!res.ok) { setError(data.error?.fieldErrors ? JSON.stringify(data.error.fieldErrors) : data.error ?? 'Failed'); return; }
      const updated = await fetch('/api/brokers').then((r) => r.json());
      setBrokers(updated);
      setModal(null);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  async function toggleActive(b: Broker) {
    const data = b.isActive
      ? { isActive: false, endDate: new Date().toISOString() }
      : { isActive: true,  endDate: null };
    const res = await fetch(`/api/brokers/${b.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) {
      const updated = await fetch('/api/brokers').then((r) => r.json());
      setBrokers(updated);
    }
  }

  async function confirmDelete(id: string) {
    await fetch(`/api/brokers/${id}`, { method: 'DELETE' });
    setBrokers((prev) => prev.filter((b) => b.id !== id));
    setDeleteId(null);
  }

  const filterLabels: { key: FilterStatus; label: string }[] = [
    { key: 'active',   label: 'Active' },
    { key: 'all',      label: 'All' },
    { key: 'inactive', label: 'Inactive' },
  ];

  return (
    <>
      <PageHeader
        title="Brokers"
        description={`${filtered.length} broker${filtered.length !== 1 ? 's' : ''}`}
        action={
          <div className="flex items-center gap-3">
            <Link href="/brokers/overview">
              <Button variant="secondary">Overview</Button>
            </Link>
            <Button variant="primary" onClick={openAdd}>+ Add Broker</Button>
          </div>
        }
      />

      {/* Filter toggle */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {filterLabels.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filterStatus === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
            <svg className="h-7 w-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M15.75 6a3.75 3.75 0 11-7.5 0 3.75 3.75 0 017.5 0zM4.501 20.118a7.5 7.5 0 0114.998 0A17.933 17.933 0 0112 21.75c-2.676 0-5.216-.584-7.499-1.632z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-900">
            {filterStatus === 'active' ? 'No active brokers' : filterStatus === 'inactive' ? 'No inactive brokers' : 'No brokers yet'}
          </p>
          <p className="mt-1 text-sm text-gray-500">
            {filterStatus === 'all' ? 'Add your first broker to get started.' : 'Try switching the filter above.'}
          </p>
          {filterStatus === 'all' && (
            <Button variant="primary" className="mt-5" onClick={openAdd}>+ Add Broker</Button>
          )}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Name', 'Start Date', 'Status', 'Owed To Us', 'We Owe Them', ''].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {filtered.map((b) => (
                <tr key={b.id} className="group hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <Link href={`/brokers/${b.id}`} className="font-semibold text-sm text-indigo-600 hover:text-indigo-800">
                      {b.name}
                    </Link>
                    {b.phone && <p className="text-xs text-gray-400 mt-0.5">{b.phone}</p>}
                  </td>
                  <td className="px-5 py-4 text-sm text-gray-500">
                    {b.startDate ? format(new Date(b.startDate), 'MMM d, yyyy') : '—'}
                  </td>
                  <td className="px-5 py-4">
                    <Badge variant={b.isActive ? 'active' : 'inactive'} />
                    {b.vehicles.length > 0 && <p className="text-xs text-gray-400 mt-0.5">{b.vehicles.length} cab{b.vehicles.length !== 1 ? 's' : ''}</p>}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                    {formatCurrency(owedToUs(b.transactions))}
                  </td>
                  <td className="px-5 py-4 text-sm font-semibold text-gray-900">
                    {formatCurrency(weOweThem(b.transactions))}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(b)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => toggleActive(b)}
                        className={b.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}>
                        {b.isActive ? 'Deactivate' : 'Reactivate'}
                      </Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(b.id)}
                        className="text-red-500 hover:text-red-700 hover:bg-red-50">Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Broker' : 'Add Broker'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" placeholder="John Smith" {...field('name')} />
            <Input label="Phone" placeholder="+1 (705) 555-0123" {...field('phone')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" {...field('startDate')} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Billing Day
                <span className="ml-1 text-xs font-normal text-gray-400">(1–31)</span>
              </label>
              <input
                type="number" min={1} max={31}
                value={form.billingDay}
                onChange={(e) => setForm((f) => ({ ...f, billingDay: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-400">
                The day of each month when this broker's charges become due. The Generate button highlights amber on or after this day when no charges exist yet for that month.
              </p>
            </div>
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || !form.name || !form.startDate}>
              {saving ? 'Saving…' : 'Save Broker'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Broker" size="sm">
        <p className="text-sm text-gray-600 mb-5">
          This will permanently delete the broker and all their transactions. This cannot be undone.
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirmDelete(deleteId!)}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}
