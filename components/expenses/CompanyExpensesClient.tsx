'use client';
import { useState, useMemo, useEffect } from 'react';
import { format } from 'date-fns';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';

// Common company-expense categories shown as suggestions — the user can
// type any string. Kept as suggestions (datalist) rather than an enum so
// new categories can be added without a schema change.
const CATEGORY_SUGGESTIONS = [
  'Rent',
  'Utilities',
  'Insurance',
  'Vehicle Maintenance',
  'Office Supplies',
  'Advertising',
  'Legal / Accounting',
  'Software / Subscription',
  'Bank Fees',
  'Travel',
  'Salary',
  'Other',
];

interface Attachment {
  id: string; expenseId: string; label: string; fileName: string;
  filePath: string; fileType: string; fileSize: number; createdAt: string;
}
interface CompanyExpense {
  id: string; date: string; amount: number; category: string;
  note: string; paid: boolean; paidDate: string | null;
  month: number; year: number; createdAt: string;
  attachments: Attachment[];
}

const EMPTY_FORM = {
  date:     new Date().toISOString().split('T')[0],
  amount:   '',
  category: 'Rent',
  note:     '',
  paid:     false,
};

function formatFileSize(bytes: number): string {
  if (bytes < 1024)        return `${bytes} B`;
  if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
  return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
}

export default function CompanyExpensesClient({
  initialExpenses, initialMonth, initialYear,
}: {
  initialExpenses: CompanyExpense[];
  initialMonth:    number;
  initialYear:     number;
}) {
  const [expenses,     setExpenses]    = useState<CompanyExpense[]>(initialExpenses);
  const [loading,      setLoading]     = useState(false);
  const [filterMonth,  setFilterMonth] = useState(initialMonth);
  const [filterYear,   setFilterYear]  = useState(initialYear);
  const [filterCat,    setFilterCat]   = useState('');
  const [filterPaid,   setFilterPaid]  = useState<'' | 'true' | 'false'>('');

  // Add / Edit modal
  const [modal,     setModal]     = useState<'add' | 'edit' | null>(null);
  const [editingId, setEditingId] = useState<string | null>(null);
  const [form,      setForm]      = useState(EMPTY_FORM);
  const [saving,    setSaving]    = useState(false);
  const [error,     setError]     = useState('');

  // Attachment modal
  const [attExpense,  setAttExpense]  = useState<CompanyExpense | null>(null);
  const [attLabel,    setAttLabel]    = useState('');
  const [attFile,     setAttFile]     = useState<File | null>(null);
  const [savingAtt,   setSavingAtt]   = useState(false);
  const [attError,    setAttError]    = useState('');

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      params.set('month', String(filterMonth));
      params.set('year',  String(filterYear));
      if (filterCat)  params.set('category', filterCat);
      if (filterPaid) params.set('paid',     filterPaid);
      const res = await fetch('/api/company-expenses?' + params.toString());
      if (res.ok) setExpenses(await res.json());
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ },
    [filterMonth, filterYear, filterCat, filterPaid]);

  const totals = useMemo(() => ({
    total: expenses.reduce((s, e) => s + e.amount, 0),
    paid:  expenses.filter((e) => e.paid).reduce((s, e) => s + e.amount, 0),
    unpaid: expenses.filter((e) => !e.paid).reduce((s, e) => s + e.amount, 0),
  }), [expenses]);

  const categories = useMemo(() => {
    const s = new Set<string>();
    for (const e of expenses) s.add(e.category);
    return Array.from(s).sort();
  }, [expenses]);

  const years = Array.from(new Set([initialYear - 1, initialYear, initialYear + 1,
    ...expenses.map((e) => e.year)])).sort((a, b) => b - a);

  function openAdd() {
    setForm(EMPTY_FORM); setEditingId(null); setError(''); setModal('add');
  }
  function openEdit(e: CompanyExpense) {
    setForm({
      date:     e.date.split('T')[0],
      amount:   String(e.amount),
      category: e.category,
      note:     e.note,
      paid:     e.paid,
    });
    setEditingId(e.id); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const payload = {
        date:     form.date,
        amount:   parseFloat(form.amount) || 0,
        category: form.category.trim() || 'Other',
        note:     form.note,
        paid:     form.paid,
      };
      const url    = modal === 'edit' ? `/api/company-expenses/${editingId}` : '/api/company-expenses';
      const method = modal === 'edit' ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(payload),
      });
      const data = await res.json();
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Failed to save'); return; }
      await refresh();
      setModal(null);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  async function deleteExpense(e: CompanyExpense) {
    if (!confirm(`Delete expense of ${formatCurrency(e.amount)} (${e.category})?`)) return;
    const res = await fetch(`/api/company-expenses/${e.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) await refresh();
    else alert('Failed to delete.');
  }

  async function togglePaid(e: CompanyExpense) {
    const res = await fetch(`/api/company-expenses/${e.id}`, {
      method:  'PUT',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ paid: !e.paid }),
    });
    if (res.ok) await refresh();
  }

  // --- Attachments ---
  function openAttachments(e: CompanyExpense) {
    setAttExpense(e); setAttLabel(''); setAttFile(null); setAttError('');
  }
  async function uploadAttachment() {
    if (!attExpense || !attFile) { setAttError('Please select a file.'); return; }
    setSavingAtt(true); setAttError('');
    try {
      const fd = new FormData();
      fd.append('file',  attFile);
      fd.append('label', attLabel);
      const res  = await fetch(`/api/company-expenses/${attExpense.id}/attachments`, {
        method: 'POST', body: fd,
      });
      const data = await res.json();
      if (!res.ok) { setAttError(data.error ?? 'Upload failed'); return; }
      setExpenses((prev) => prev.map((e) =>
        e.id === attExpense.id ? { ...e, attachments: [data, ...e.attachments] } : e
      ));
      setAttExpense((prev) => prev ? { ...prev, attachments: [data, ...(prev.attachments ?? [])] } : prev);
      setAttLabel(''); setAttFile(null);
    } catch { setAttError('Network error'); }
    finally { setSavingAtt(false); }
  }
  async function deleteAttachment(expenseId: string, attId: string) {
    if (!confirm('Delete this attachment?')) return;
    const res = await fetch(`/api/company-expenses/attachments/${attId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setExpenses((prev) => prev.map((e) =>
        e.id === expenseId ? { ...e, attachments: e.attachments.filter((a) => a.id !== attId) } : e
      ));
      setAttExpense((prev) => prev ? { ...prev, attachments: prev.attachments.filter((a) => a.id !== attId) } : prev);
    }
  }

  return (
    <>
      <PageHeader
        title="Company Expenses"
        description={`${expenses.length} expense${expenses.length !== 1 ? 's' : ''} · ${formatCurrency(totals.total)} total${totals.unpaid > 0 ? ` · ${formatCurrency(totals.unpaid)} unpaid` : ''}`}
        action={<Button variant="primary" onClick={openAdd}>+ Add Expense</Button>}
      />

      {/* Filters */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-4">
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          <Select label="Month" value={String(filterMonth)} onChange={(e) => setFilterMonth(parseInt(e.target.value))}>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
          <Select label="Year" value={String(filterYear)} onChange={(e) => setFilterYear(parseInt(e.target.value))}>
            {years.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select label="Category" value={filterCat} onChange={(e) => setFilterCat(e.target.value)}>
            <option value="">All Categories</option>
            {categories.map((c) => <option key={c} value={c}>{c}</option>)}
          </Select>
          <Select label="Status" value={filterPaid} onChange={(e) => setFilterPaid(e.target.value as any)}>
            <option value="">All</option>
            <option value="false">Unpaid</option>
            <option value="true">Paid</option>
          </Select>
        </div>
      </div>

      {/* Totals strip */}
      <div className="grid grid-cols-3 gap-4">
        <SummaryCard label={`Total (${MONTHS[filterMonth - 1]} ${filterYear})`} value={totals.total} tone="indigo" />
        <SummaryCard label="Paid"   value={totals.paid}   tone="emerald" />
        <SummaryCard label="Unpaid" value={totals.unpaid} tone="amber"   />
      </div>

      {loading ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 py-12 text-center text-sm text-gray-400">Loading…</div>
      ) : expenses.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-base font-semibold text-gray-900">No company expenses this month</p>
          <p className="mt-1 text-sm text-gray-500">Track rent, utilities, insurance, and other company-wide costs.</p>
          <Button variant="primary" className="mt-5" onClick={openAdd}>+ Add Expense</Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full text-sm">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Date', 'Category', 'Amount', 'Note', 'Status', 'Bill / Receipt', ''].map((h) => (
                    <th key={h} className="px-4 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map((e) => (
                  <tr key={e.id} className="group hover:bg-gray-50">
                    <td className="px-4 py-3 text-gray-700 whitespace-nowrap">{format(new Date(e.date), 'MMM d, yyyy')}</td>
                    <td className="px-4 py-3">
                      <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700 ring-1 ring-indigo-600/20">
                        {e.category}
                      </span>
                    </td>
                    <td className="px-4 py-3 font-semibold text-gray-900 whitespace-nowrap">{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3 text-gray-600 max-w-[280px] truncate" title={e.note}>{e.note || '—'}</td>
                    <td className="px-4 py-3">
                      <button onClick={() => togglePaid(e)}
                        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium cursor-pointer transition-colors ${
                          e.paid
                            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20 hover:bg-emerald-100'
                            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-600/20 hover:bg-amber-100'
                        }`}>
                        {e.paid ? 'Paid' : 'Unpaid'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <button onClick={() => openAttachments(e)}
                        className="inline-flex items-center gap-1.5 text-xs text-indigo-600 hover:text-indigo-800 font-medium">
                        <svg className="w-3.5 h-3.5" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M15.172 7l-6.586 6.586a2 2 0 102.828 2.828l6.414-6.586a4 4 0 00-5.656-5.656l-6.415 6.585a6 6 0 108.486 8.486L20.5 13" />
                        </svg>
                        {e.attachments.length > 0 ? `${e.attachments.length} file${e.attachments.length !== 1 ? 's' : ''}` : 'Attach'}
                      </button>
                    </td>
                    <td className="px-4 py-3">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(e)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteExpense(e)}
                          className="text-red-500 hover:bg-red-50">Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="border-t-2 border-gray-200 bg-gray-50">
                  <td className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500" colSpan={2}>
                    Totals ({expenses.length})
                  </td>
                  <td className="px-4 py-3 font-bold text-gray-900 whitespace-nowrap">{formatCurrency(totals.total)}</td>
                  <td colSpan={4} />
                </tr>
              </tfoot>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)}
        title={modal === 'edit' ? 'Edit Company Expense' : 'Add Company Expense'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Date" type="date"
              value={form.date}
              onChange={(e) => setForm((f) => ({ ...f, date: e.target.value }))}
            />
            <Input label="Amount ($)" type="number" min={0} step={0.01} placeholder="0.00"
              value={form.amount}
              onChange={(e) => setForm((f) => ({ ...f, amount: e.target.value }))}
            />
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Category</label>
            <input
              type="text"
              list="company-expense-categories"
              placeholder="e.g. Rent, Utilities, Insurance"
              value={form.category}
              onChange={(e) => setForm((f) => ({ ...f, category: e.target.value }))}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
            <datalist id="company-expense-categories">
              {CATEGORY_SUGGESTIONS.map((c) => <option key={c} value={c} />)}
            </datalist>
            <p className="mt-1 text-xs text-gray-400">Type any category — suggestions appear as you type.</p>
          </div>

          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Reason / Note</label>
            <textarea
              value={form.note}
              onChange={(e) => setForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="What's this expense for? Who's the vendor? Any reference numbers?"
              rows={3}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>

          <label className="flex items-center gap-2 text-sm text-gray-700">
            <input type="checkbox"
              checked={form.paid}
              onChange={(e) => setForm((f) => ({ ...f, paid: e.target.checked }))}
              className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
            />
            Already paid
          </label>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          {modal === 'add' && (
            <p className="rounded-lg bg-indigo-50 border border-indigo-100 px-3 py-2 text-xs text-indigo-700">
              You'll be able to attach a bill or receipt after saving.
            </p>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={save}
              disabled={saving || !form.date || !form.amount || !form.category}>
              {saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Add Expense'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Attachment modal */}
      <Modal open={attExpense !== null} onClose={() => setAttExpense(null)}
        title={`Bill / Receipt — ${attExpense?.category ?? ''}`}>
        <div className="space-y-4">
          {attExpense && attExpense.attachments.length > 0 && (
            <div className="space-y-2">
              {attExpense.attachments.map((a) => (
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
            <p className="text-sm text-gray-400">No bill attached yet.</p>
          )}

          {/* Upload new */}
          <div className="border-t border-gray-100 pt-4 space-y-3">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400">Upload New File</p>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Label <span className="text-xs font-normal text-gray-400">(e.g. Receipt, Invoice)</span>
              </label>
              <input type="text" value={attLabel} placeholder="e.g. Hydro bill — March"
                onChange={(e) => setAttLabel(e.target.value)}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <input type="file"
                accept=".pdf,.jpg,.jpeg,.png,.webp,.heic,.heif"
                onChange={(e) => setAttFile(e.target.files?.[0] ?? null)}
                className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
              />
              {attFile && <p className="mt-1 text-xs text-gray-400">{attFile.name} · {formatFileSize(attFile.size)}</p>}
            </div>
            {attError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{attError}</p>}
            <div className="flex justify-end gap-2">
              <Button variant="ghost" onClick={() => setAttExpense(null)}>Close</Button>
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

function SummaryCard({ label, value, tone }: {
  label: string; value: number; tone: 'indigo' | 'emerald' | 'amber';
}) {
  const tones = {
    indigo:  'text-indigo-600',
    emerald: 'text-emerald-600',
    amber:   'text-amber-600',
  };
  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-5">
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`mt-1 text-2xl font-bold ${tones[tone]}`}>{formatCurrency(value)}</p>
    </div>
  );
}
