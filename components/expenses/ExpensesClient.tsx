'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';

interface BrokerVehicle { id: string; cabNumber: string; }
interface Broker   { id: string; name: string; vehicles: BrokerVehicle[]; }
interface Expense  {
  id: string; brokerId: string; cabNumber: string; date: string;
  amount: number; note: string; createdAt: string;
  broker: { id: string; name: string };
}

const EMPTY_FORM = { brokerId: '', cabNumber: '', date: new Date().toISOString().split('T')[0], amount: '', note: '' };

export default function ExpensesClient({ initialExpenses, brokers }: { initialExpenses: Expense[]; brokers: Broker[] }) {
  const [expenses,   setExpenses]  = useState<Expense[]>(initialExpenses);
  const [showAdd,    setShowAdd]   = useState(false);
  const [form,       setForm]      = useState(EMPTY_FORM);
  const [saving,     setSaving]    = useState(false);
  const [error,      setError]     = useState('');
  const [filterBroker, setFilter]  = useState('');

  const filtered = useMemo(() =>
    filterBroker ? expenses.filter(e => e.brokerId === filterBroker) : expenses,
  [expenses, filterBroker]);

  const totalAmount = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  const selectedBroker = brokers.find(b => b.id === form.brokerId);

  function openAdd() { setForm(EMPTY_FORM); setError(''); setShowAdd(true); }

  async function save() {
    setSaving(true); setError('');
    try {
      const res  = await fetch('/api/expenses', {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...form, amount: parseFloat(form.amount) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      setExpenses(prev => [data, ...prev]);
      setShowAdd(false);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    const res = await fetch(`/api/brokers/expenses/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) setExpenses(prev => prev.filter(e => e.id !== id));
  }

  return (
    <>
      <PageHeader
        title="Expenses"
        description={`${filtered.length} expense${filtered.length !== 1 ? 's' : ''}${filterBroker ? '' : ' across all brokers'} · ${formatCurrency(totalAmount)} total`}
        action={<Button variant="primary" onClick={openAdd}>+ Add Expense</Button>}
      />

      {/* Broker filter */}
      <div className="flex items-center gap-3">
        <select
          value={filterBroker}
          onChange={e => setFilter(e.target.value)}
          className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
        >
          <option value="">All Brokers</option>
          {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
        </select>
        {filterBroker && (
          <button onClick={() => setFilter('')} className="text-xs text-indigo-600 hover:underline">Clear filter</button>
        )}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
            <svg className="h-7 w-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-900">No expenses yet</p>
          <p className="mt-1 text-sm text-gray-500">Log expenses when a broker takes something from the company.</p>
          <Button variant="primary" className="mt-5" onClick={openAdd}>+ Add Expense</Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Date', 'Broker', 'Cab #', 'Amount', 'Note', ''].map(h => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map(e => (
                  <tr key={e.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 text-sm text-gray-500 whitespace-nowrap">
                      {format(new Date(e.date), 'MMM d, yyyy')}
                    </td>
                    <td className="px-5 py-4 text-sm">
                      <Link href={`/brokers/${e.broker.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">
                        {e.broker.name}
                      </Link>
                    </td>
                    <td className="px-5 py-4 font-mono text-sm text-gray-700">{e.cabNumber || '—'}</td>
                    <td className="px-5 py-4 text-sm font-semibold text-gray-900">{formatCurrency(e.amount)}</td>
                    <td className="px-5 py-4 text-sm text-gray-600 max-w-[220px] truncate">{e.note || '—'}</td>
                    <td className="px-5 py-4">
                      <Button size="sm" variant="ghost" onClick={() => deleteExpense(e.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50">
                        Delete
                      </Button>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Total</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900">{formatCurrency(totalAmount)}</td>
                  <td colSpan={2} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Add Expense Modal */}
      <Modal open={showAdd} onClose={() => setShowAdd(false)} title="Add Expense">
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Broker</label>
            <select
              value={form.brokerId}
              onChange={e => setForm(f => ({ ...f, brokerId: e.target.value, cabNumber: '' }))}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">— Select broker —</option>
              {brokers.map(b => <option key={b.id} value={b.id}>{b.name}</option>)}
            </select>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cab #</label>
              {selectedBroker && selectedBroker.vehicles.length > 0 ? (
                <select
                  value={form.cabNumber}
                  onChange={e => setForm(f => ({ ...f, cabNumber: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Select cab —</option>
                  {selectedBroker.vehicles.map(v => <option key={v.id} value={v.cabNumber}>#{v.cabNumber}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={form.cabNumber}
                  onChange={e => setForm(f => ({ ...f, cabNumber: e.target.value }))}
                  placeholder="e.g. 11"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={form.date}
                onChange={e => setForm(f => ({ ...f, date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <Input label="Amount ($)" type="number" min={0} step={0.01} placeholder="0.00"
            value={form.amount} onChange={e => setForm(f => ({ ...f, amount: e.target.value }))} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input type="text" value={form.note}
              onChange={e => setForm(f => ({ ...f, note: e.target.value }))}
              placeholder="What did the broker take?"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAdd(false)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || !form.brokerId || !form.amount || !form.date}>
              {saving ? 'Saving…' : 'Add Expense'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
