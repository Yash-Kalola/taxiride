'use client';
import { useState } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { MONTHS, YEARS } from '@/lib/constants';
import { formatCurrency } from '@/lib/tax';

interface Company { id: string; companyName: string; }
interface Invoice {
  id: string; invoiceNumber: number; companyId: string; month: string; year: number;
  amountPreTax: number; hst: number; total: number; dateSent: string; dueDate: string;
  status: string; verified: boolean; flagged: boolean;
  company: { companyName: string; accountId: string };
}

function statusBadge(inv: Invoice): 'paid' | 'pending' | 'draft' | 'flagged' | 'overdue' {
  if (inv.flagged && !inv.verified) return 'flagged';
  if (inv.status === 'PAID')        return 'paid';
  if (inv.status === 'DRAFT')       return 'draft';
  const today = new Date().toISOString().split('T')[0];
  if (inv.dueDate && inv.dueDate < today) return 'overdue';
  return 'pending';
}

export default function InvoicesClient({ initialInvoices, companies }: { initialInvoices: Invoice[]; companies: Company[] }) {
  const [invoices, setInvoices]         = useState<Invoice[]>(initialInvoices);
  const [filterYear,    setFilterYear]  = useState<number | ''>('');
  const [filterMonth,   setFilterMonth] = useState('');
  const [filterStatus,  setFilterStatus]= useState('');
  const [filterCompany, setFilterComp]  = useState('');
  const [filterFlagged, setFilterFlagged] = useState('');
  const [showGenerate,  setShowGenerate]= useState(false);
  const [genForm, setGenForm]           = useState({ companyId: '', month: String(MONTHS[new Date().getMonth()]), year: new Date().getFullYear() });
  const [generating,    setGenerating]  = useState(false);
  const [genResult,     setGenResult]   = useState<{ invoiceId?: string; invoiceNumber?: number; flagged?: boolean; error?: string } | null>(null);

  const filtered = invoices.filter((inv) => {
    if (filterYear    && inv.year      !== filterYear)    return false;
    if (filterMonth   && inv.month     !== filterMonth)   return false;
    if (filterCompany && inv.companyId !== filterCompany) return false;
    if (filterStatus  && inv.status    !== filterStatus)  return false;
    if (filterFlagged === 'yes' && !(inv.flagged && !inv.verified)) return false;
    return true;
  });

  const totals = {
    invoiced: filtered.reduce((s, i) => s + i.total, 0),
    received: filtered.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.total, 0),
    pending:  filtered.filter((i) => i.status === 'PENDING').reduce((s, i) => s + i.total, 0),
  };

  async function patch(id: string, data: object) {
    const res = await fetch(`/api/invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) {
      const updated = await res.json();
      setInvoices((prev) => prev.map((i) => i.id === id ? { ...i, ...updated } : i));
    }
  }

  async function generate() {
    setGenerating(true); setGenResult(null);
    try {
      const res  = await fetch('/api/invoices/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(genForm) });
      const data = await res.json();
      if (!res.ok) { setGenResult({ error: data.error ?? 'Failed' }); return; }
      setGenResult({ invoiceId: data.invoiceId, invoiceNumber: data.invoiceNumber, flagged: data.flagged });
      // Re-fetch invoices
      const updated = await fetch('/api/invoices').then((r) => r.json());
      setInvoices(updated);
    } catch { setGenResult({ error: 'Network error' }); }
    finally { setGenerating(false); }
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Invoices"
          description={`${invoices.length} invoices`}
          action={<Button variant="primary" onClick={() => { setGenResult(null); setShowGenerate(true); }}>+ Generate Invoice</Button>}
        />

        {/* Summary cards */}
        <div className="grid grid-cols-3 gap-4">
          {[
            { label: 'Total Invoiced', value: totals.invoiced, color: 'text-indigo-600' },
            { label: 'Received',       value: totals.received, color: 'text-emerald-600' },
            { label: 'Pending',        value: totals.pending,  color: 'text-amber-600' },
          ].map((c) => (
            <div key={c.label} className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200">
              <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{c.label}</p>
              <p className={`mt-1.5 text-2xl font-bold ${c.color}`}>{formatCurrency(c.value)}</p>
            </div>
          ))}
        </div>

        {/* Filters */}
        <div className="flex flex-wrap gap-3">
          <Select value={String(filterYear)} onChange={(e) => setFilterYear(e.target.value ? parseInt(e.target.value) : '')} className="w-28">
            <option value="">All Years</option>
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select value={filterMonth} onChange={(e) => setFilterMonth(e.target.value)} className="w-36">
            <option value="">All Months</option>
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select value={filterCompany} onChange={(e) => setFilterComp(e.target.value)} className="w-48">
            <option value="">All Companies</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Select>
          <Select value={filterStatus} onChange={(e) => setFilterStatus(e.target.value)} className="w-32">
            <option value="">All Status</option>
            <option value="DRAFT">Draft</option>
            <option value="PENDING">Pending</option>
            <option value="PAID">Paid</option>
          </Select>
          <Select value={filterFlagged} onChange={(e) => setFilterFlagged(e.target.value)} className="w-36">
            <option value="">All Invoices</option>
            <option value="yes">Flagged Only</option>
          </Select>
        </div>

        {filtered.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
            <p className="text-base font-semibold text-gray-900">No invoices found</p>
            <p className="mt-1 text-sm text-gray-500">Generate your first invoice to get started.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Invoice #', 'Company', 'Period', 'Amount', 'Date Sent', 'Due Date', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((inv) => {
                  const sv = statusBadge(inv);
                  const isFlagged = inv.flagged && !inv.verified;
                  return (
                    <tr key={inv.id} className={`group hover:bg-gray-50 transition-colors ${isFlagged ? 'border-l-4 border-l-red-400' : ''}`}>
                      <td className="px-4 py-3.5">
                        <Link href={`/invoices/${inv.id}`} className="font-mono text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                          #{inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{inv.company.companyName}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{inv.month} {inv.year}</td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{formatCurrency(inv.total)}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{inv.dateSent || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{inv.dueDate || '—'}</td>
                      <td className="px-4 py-3.5"><Badge variant={sv} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}>PDF</Button>
                          <Link href={`/invoices/${inv.id}`}>
                            <Button size="sm" variant="ghost">Edit</Button>
                          </Link>
                          {inv.status !== 'PAID'
                            ? <Button size="sm" variant="ghost" onClick={() => patch(inv.id, { status: 'PAID' })} className="text-emerald-600 hover:bg-emerald-50">Mark Paid</Button>
                            : <Button size="sm" variant="ghost" onClick={() => patch(inv.id, { status: 'PENDING' })}>Unpaid</Button>
                          }
                          {isFlagged && (
                            <Button size="sm" variant="ghost" onClick={() => patch(inv.id, { flagged: false, verified: true })} className="text-gray-400 hover:text-gray-600">Unflag</Button>
                          )}
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Generate Invoice Modal */}
      <Modal open={showGenerate} onClose={() => setShowGenerate(false)} title="Generate Invoice">
        <div className="space-y-4">
          <Select label="Company" value={genForm.companyId} onChange={(e) => setGenForm((f) => ({ ...f, companyId: e.target.value }))}>
            <option value="">Select company…</option>
            {companies.map((c) => <option key={c.id} value={c.id}>{c.companyName}</option>)}
          </Select>
          <div className="grid grid-cols-2 gap-4">
            <Select label="Month" value={genForm.month} onChange={(e) => setGenForm((f) => ({ ...f, month: e.target.value }))}>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select label="Year" value={genForm.year} onChange={(e) => setGenForm((f) => ({ ...f, year: parseInt(e.target.value) }))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>

          {genResult?.error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{genResult.error}</p>}
          {genResult?.invoiceNumber && (
            <div className="rounded-lg bg-emerald-50 px-3 py-2 text-sm text-emerald-700">
              Invoice #{genResult.invoiceNumber} created as draft.{' '}
              {genResult.flagged && <span className="font-medium">⚠ Flagged — total is lower than last month.</span>}
              {' '}<Link href={`/invoices/${genResult.invoiceId}`} className="font-semibold underline">Review & Send →</Link>
            </div>
          )}

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowGenerate(false)}>{genResult?.invoiceNumber ? 'Close' : 'Cancel'}</Button>
            {!genResult?.invoiceNumber && (
              <Button variant="primary" onClick={generate} disabled={generating || !genForm.companyId}>
                {generating ? 'Generating…' : 'Generate Draft'}
              </Button>
            )}
          </div>
        </div>
      </Modal>
    </>
  );
}
