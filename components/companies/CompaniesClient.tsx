'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';

interface Company {
  id: string;
  accountId: string;
  companyName: string;
  contactName: string;
  address: string;
  poNumber: string;
  expectedMonthlyRides: number;
  email: string;
  notes: string;
  _count: { rides: number; invoices: number };
}

const EMPTY = { accountId: '', companyName: '', contactName: '', address: '', poNumber: '', expectedMonthlyRides: 0, email: '', notes: '' };

export default function CompaniesClient({ initialCompanies }: { initialCompanies: Company[] }) {
  const [companies, setCompanies]   = useState<Company[]>(initialCompanies);
  const [modal, setModal]           = useState<'add' | 'edit' | null>(null);
  const [editing, setEditing]       = useState<Company | null>(null);
  const [form, setForm]             = useState(EMPTY);
  const [saving, setSaving]         = useState(false);
  const [error, setError]           = useState('');
  const [deleteId, setDeleteId]     = useState<string | null>(null);

  function openAdd()  { setForm(EMPTY); setEditing(null); setError(''); setModal('add'); }
  function openEdit(c: Company) {
    setForm({ accountId: c.accountId, companyName: c.companyName, contactName: c.contactName ?? '', address: c.address, poNumber: c.poNumber, expectedMonthlyRides: c.expectedMonthlyRides, email: c.email, notes: c.notes ?? '' });
    setEditing(c); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const url  = modal === 'edit' ? `/api/companies/${editing!.id}` : '/api/companies';
      const method = modal === 'edit' ? 'PUT' : 'POST';
      const res  = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(form) });
      const data = await res.json();
      if (!res.ok) { setError(data.error?.fieldErrors ? JSON.stringify(data.error.fieldErrors) : data.error ?? 'Failed'); return; }
      // Refresh list
      const updated = await fetch('/api/companies').then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
      setCompanies(updated);
      setModal(null);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  async function confirmDelete(id: string) {
    try {
      const res = await fetch(`/api/companies/${id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        setCompanies((prev) => prev.filter((c) => c.id !== id));
      } else {
        const data = await res.json().catch(() => null);
        alert(data?.error ?? 'Delete failed — this company may have invoices. Remove its invoices first.');
      }
    } catch {
      alert('Network error — please try again.');
    }
    setDeleteId(null);
  }

  const field = (key: keyof typeof EMPTY) => ({
    value: String(form[key]),
    onChange: (e: React.ChangeEvent<HTMLInputElement>) => setForm((f) => ({ ...f, [key]: key === 'expectedMonthlyRides' ? parseInt(e.target.value) || 0 : e.target.value })),
  });

  return (
    <>
      <PageHeader
        title="Companies"
        description={`${companies.length} companies`}
        action={<Button variant="primary" onClick={openAdd}>+ Add Company</Button>}
      />

      {companies.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
            <svg className="h-7 w-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16m14 0h2m-2 0h-5m-9 0H3m2 0h5" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-900">No companies yet</p>
          <p className="mt-1 text-sm text-gray-500">Add your first company to get started.</p>
          <Button variant="primary" className="mt-5" onClick={openAdd}>+ Add Company</Button>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Company', 'Account ID', 'Email', 'PO #', 'Rides', 'Invoices', 'Notes', ''].map((h) => (
                  <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {companies.map((c) => (
                <tr key={c.id} className="group hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-4">
                    <p className="font-semibold text-sm text-gray-900">{c.companyName}</p>
                    <p className="text-xs text-gray-400 mt-0.5 truncate max-w-[200px]">{c.address || '—'}</p>
                  </td>
                  <td className="px-5 py-4 font-mono text-sm text-gray-600">{c.accountId}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{c.email || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-600">{c.poNumber || '—'}</td>
                  <td className="px-5 py-4 text-sm text-gray-700 font-medium">{c._count.rides}</td>
                  <td className="px-5 py-4 text-sm text-gray-700 font-medium">{c._count.invoices}</td>
                  {/* Internal note — truncated chip with full text in tooltip.
                      Click opens the edit modal so the note can be updated. */}
                  <td className="px-5 py-4 max-w-[220px]">
                    {c.notes ? (
                      <button
                        type="button"
                        onClick={() => openEdit(c)}
                        title={c.notes}
                        className="inline-flex items-center gap-1 rounded-md bg-amber-50 px-2 py-0.5 text-xs text-amber-800 ring-1 ring-amber-200 hover:bg-amber-100 max-w-full"
                      >
                        <svg className="h-3 w-3 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
                          <path strokeLinecap="round" strokeLinejoin="round" d="M9 12h6m-6 4h6m2 5H7a2 2 0 01-2-2V5a2 2 0 012-2h5.586a1 1 0 01.707.293l5.414 5.414a1 1 0 01.293.707V19a2 2 0 01-2 2z" />
                        </svg>
                        <span className="truncate">{c.notes}</span>
                      </button>
                    ) : (
                      <span className="text-xs text-gray-300">—</span>
                    )}
                  </td>
                  <td className="px-5 py-4">
                    <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                      <Button size="sm" variant="ghost" onClick={() => openEdit(c)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => setDeleteId(c.id)} className="text-red-500 hover:text-red-700 hover:bg-red-50">Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Company' : 'Add Company'}>
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Company Name" placeholder="Acme Corp" {...field('companyName')} />
            <Input label="Account ID" placeholder="ACC001" {...field('accountId')} />
          </div>
          <Input label="Contact Name" placeholder="Jane Smith" {...field('contactName')} />
          <Input label="Address" placeholder="123 Main St, City, Province" {...field('address')} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Email" type="email" placeholder="billing@company.com" {...field('email')} />
            <Input label="PO #" placeholder="PO-842" {...field('poNumber')} />
          </div>
          <Input label="Expected Monthly Rides" type="number" min={0} {...field('expectedMonthlyRides')} />
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Notes <span className="text-xs font-normal text-gray-400">(internal — not shown on invoices)</span>
            </label>
            <textarea
              value={form.notes}
              onChange={(e) => setForm((f) => ({ ...f, notes: e.target.value }))}
              rows={3}
              placeholder="Anything to remember about this company — special instructions, payment terms, contact preferences…"
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Company'}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteId !== null} onClose={() => setDeleteId(null)} title="Delete Company" size="sm">
        <p className="text-sm text-gray-600 mb-5">This will permanently delete the company and all its rides. This cannot be undone.</p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteId(null)}>Cancel</Button>
          <Button variant="danger" onClick={() => confirmDelete(deleteId!)}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}
