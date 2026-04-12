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
interface ExpenseAttachment {
  id: string; expenseId: string; label: string; fileName: string;
  filePath: string; fileType: string; fileSize: number; createdAt: string;
}
interface Expense  {
  id: string; brokerId: string; cabNumber: string; date: string;
  amount: number; note: string; createdAt: string;
  broker: { id: string; name: string };
  attachments: ExpenseAttachment[];
}

const EMPTY_FORM = { brokerId: '', cabNumber: '', date: new Date().toISOString().split('T')[0], amount: '', note: '' };
const EMPTY_EDIT = { cabNumber: '', date: '', amount: '', note: '' };

function formatFileSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function ExpensesClient({ initialExpenses, brokers, initialBroker = '' }: { initialExpenses: Expense[]; brokers: Broker[]; initialBroker?: string }) {
  const [expenses,   setExpenses]  = useState<Expense[]>(initialExpenses);
  const [showAdd,    setShowAdd]   = useState(false);
  const [form,       setForm]      = useState(EMPTY_FORM);
  const [saving,     setSaving]    = useState(false);
  const [error,      setError]     = useState('');
  const [filterBroker, setFilter]  = useState(initialBroker);

  // Edit state
  const [showEdit,    setShowEdit]   = useState(false);
  const [editingExp,  setEditingExp] = useState<Expense | null>(null);
  const [editForm,    setEditForm]   = useState(EMPTY_EDIT);
  const [savingEdit,  setSavingEdit] = useState(false);
  const [editError,   setEditError]  = useState('');

  // Attachment state
  const [attExpense,  setAttExpense]  = useState<Expense | null>(null);
  const [showAttModal, setShowAttModal] = useState(false);
  const [attLabel,    setAttLabel]    = useState('');
  const [attFile,     setAttFile]     = useState<File | null>(null);
  const [savingAtt,   setSavingAtt]   = useState(false);
  const [attError,    setAttError]    = useState('');

  const filtered = useMemo(() =>
    filterBroker ? expenses.filter(e => e.brokerId === filterBroker) : expenses,
  [expenses, filterBroker]);

  const totalAmount = useMemo(() => filtered.reduce((s, e) => s + e.amount, 0), [filtered]);

  const selectedBroker = brokers.find(b => b.id === form.brokerId);

  function openAdd() {
    setForm({ ...EMPTY_FORM, brokerId: filterBroker });
    setError(''); setShowAdd(true);
  }

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

  function openEdit(e: Expense) {
    setEditForm({
      cabNumber: e.cabNumber || '',
      date:      e.date ? e.date.split('T')[0] : '',
      amount:    String(e.amount),
      note:      e.note || '',
    });
    setEditingExp(e); setEditError(''); setShowEdit(true);
  }

  async function saveEdit() {
    if (!editingExp) return;
    setSavingEdit(true); setEditError('');
    try {
      const res  = await fetch(`/api/brokers/expenses/${editingExp.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...editForm, amount: parseFloat(editForm.amount) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { setEditError(data.error ?? 'Failed'); return; }
      setExpenses(prev => prev.map(e => e.id === editingExp.id ? data : e));
      setShowEdit(false);
    } catch { setEditError('Network error'); }
    finally { setSavingEdit(false); }
  }

  async function deleteExpense(id: string) {
    if (!confirm('Delete this expense?')) return;
    const res = await fetch(`/api/brokers/expenses/${id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) setExpenses(prev => prev.filter(e => e.id !== id));
  }

  // Attachment handlers
  function openAttachments(e: Expense) {
    setAttExpense(e); setAttLabel(''); setAttFile(null); setAttError(''); setShowAttModal(true);
  }

  async function uploadAttachment() {
    if (!attExpense || !attFile) { setAttError('Please select a file.'); return; }
    setSavingAtt(true); setAttError('');
    try {
      const fd = new FormData();
      fd.append('file',  attFile);
      fd.append('label', attLabel);
      const res  = await fetch(`/api/expenses/${attExpense.id}/attachments`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setAttError(data.error ?? 'Upload failed'); return; }
      setExpenses(prev => prev.map(e =>
        e.id === attExpense.id ? { ...e, attachments: [data, ...e.attachments] } : e
      ));
      setAttExpense(prev => prev ? { ...prev, attachments: [data, ...(prev.attachments ?? [])] } : prev);
      setAttLabel(''); setAttFile(null);
    } catch { setAttError('Network error'); }
    finally { setSavingAtt(false); }
  }

  async function deleteAttachment(expenseId: string, attId: string) {
    if (!confirm('Delete this attachment?')) return;
    const res = await fetch(`/api/expenses/attachments/${attId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setExpenses(prev => prev.map(e =>
        e.id === expenseId ? { ...e, attachments: e.attachments.filter(a => a.id !== attId) } : e
      ));
      setAttExpense(prev => prev ? { ...prev, attachments: prev.attachments.filter(a => a.id !== attId) } : prev);
    }
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
                  {['Date', 'Broker', 'Cab #', 'Amount', 'Note', 'Attachments', ''].map(h => (
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
                    <td className="px-5 py-4 text-sm text-gray-600 max-w-[200px] truncate">{e.note || '—'}</td>
                    <td className="px-5 py-4">
                      <button
                        onClick={() => openAttachments(e)}
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium"
                      >
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        {e.attachments.length > 0 ? `${e.attachments.length} file${e.attachments.length !== 1 ? 's' : ''}` : 'Attach'}
                      </button>
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}
                          className="opacity-0 group-hover:opacity-100">Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteExpense(e.id)}
                          className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50">
                          Delete
                        </Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td colSpan={3} className="px-5 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">Total</td>
                  <td className="px-5 py-3 text-sm font-bold text-gray-900">{formatCurrency(totalAmount)}</td>
                  <td colSpan={3} />
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
              {selectedBroker && selectedBroker.vehicles.length === 0 && form.cabNumber && (
                <p className="mt-1 text-xs text-amber-600">⚠ No cabs registered for this broker — cab will be validated on save.</p>
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

      {/* Edit Expense Modal */}
      <Modal open={showEdit} onClose={() => setShowEdit(false)} title="Edit Expense">
        <div className="space-y-4">
          {editingExp && (
            <div className="rounded-xl bg-gray-50 border border-gray-200 px-4 py-3">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-1">Broker</p>
              <p className="text-sm font-semibold text-gray-900">{editingExp.broker.name}</p>
            </div>
          )}

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cab #</label>
              {editingExp && brokers.find(b => b.id === editingExp.brokerId)?.vehicles.length ? (
                <select
                  value={editForm.cabNumber}
                  onChange={e => setEditForm(f => ({ ...f, cabNumber: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Select cab —</option>
                  {brokers.find(b => b.id === editingExp?.brokerId)?.vehicles.map(v => (
                    <option key={v.id} value={v.cabNumber}>#{v.cabNumber}</option>
                  ))}
                </select>
              ) : (
                <input type="text" value={editForm.cabNumber}
                  onChange={e => setEditForm(f => ({ ...f, cabNumber: e.target.value }))}
                  placeholder="e.g. 11"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={editForm.date}
                onChange={e => setEditForm(f => ({ ...f, date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <Input label="Amount ($)" type="number" min={0} step={0.01} placeholder="0.00"
            value={editForm.amount} onChange={e => setEditForm(f => ({ ...f, amount: e.target.value }))} />

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input type="text" value={editForm.note}
              onChange={e => setEditForm(f => ({ ...f, note: e.target.value }))}
              placeholder="What did the broker take?"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          {editError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{editError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveEdit} disabled={savingEdit || !editForm.amount || !editForm.date}>
              {savingEdit ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Attachments Modal */}
      <Modal
        open={showAttModal}
        onClose={() => setShowAttModal(false)}
        title={`Attachments — ${attExpense?.broker?.name ?? ''}`}
      >
        <div className="space-y-4">
          {/* Existing attachments */}
          {attExpense && attExpense.attachments.length > 0 && (
            <div className="space-y-2">
              {attExpense.attachments.map(a => (
                <div key={a.id} className="flex items-center justify-between rounded-lg bg-gray-50 border border-gray-200 px-3 py-2">
                  <div className="flex items-center gap-2 min-w-0">
                    <svg className="w-4 h-4 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                    </svg>
                    <div className="min-w-0">
                      {a.label && <p className="text-xs font-semibold text-gray-700">{a.label}</p>}
                      <p className="text-xs text-gray-500 truncate">{a.fileName}</p>
                      <p className="text-xs text-gray-400">{formatFileSize(a.fileSize)}</p>
                    </div>
                  </div>
                  <div className="flex gap-2 shrink-0 ml-3">
                    <a href={a.filePath} target="_blank" rel="noopener noreferrer"
                      className="text-xs text-indigo-600 hover:underline font-medium">Download</a>
                    <button onClick={() => deleteAttachment(attExpense.id, a.id)}
                      className="text-xs text-red-500 hover:text-red-700">Delete</button>
                  </div>
                </div>
              ))}
            </div>
          )}
          {attExpense && attExpense.attachments.length === 0 && (
            <p className="text-sm text-gray-400">No attachments yet.</p>
          )}

          {/* Upload new */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Upload New File</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Label <span className="text-xs font-normal text-gray-400">(e.g. Receipt, Invoice)</span>
              </label>
              <input type="text" value={attLabel} placeholder="e.g. Receipt"
                onChange={e => setAttLabel(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <input
                type="file"
                accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
                onChange={e => setAttFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {attFile && <p className="mt-1 text-xs text-gray-400">{attFile.name} · {formatFileSize(attFile.size)}</p>}
            </div>
            {attError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{attError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setShowAttModal(false)}>Close</Button>
              <Button variant="primary" onClick={uploadAttachment} disabled={savingAtt || !attFile}>
                {savingAtt ? 'Uploading…' : 'Upload'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>
    </>
  );
}
