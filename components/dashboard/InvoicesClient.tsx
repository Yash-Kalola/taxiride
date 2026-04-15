'use client';
import { useState, useMemo } from 'react';
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
  paymentMethod: string | null; paymentRef: string;
  company: { companyName: string; accountId: string };
}

const PAYMENT_METHODS = [
  { value: 'DEBIT',      label: 'Debit' },
  { value: 'CREDIT',     label: 'Credit' },
  { value: 'E_TRANSFER', label: 'E-Transfer' },
  { value: 'CHEQUE',     label: 'Cheque' },
  { value: 'CASH',       label: 'Cash' },
  { value: 'OTHER',      label: 'Other' },
] as const;

type SortKey = 'invoiceNumber' | 'companyName' | 'total';
type SortDir = 'asc' | 'desc';

function statusBadge(inv: Invoice): 'paid' | 'pending' | 'draft' | 'flagged' | 'overdue' {
  if (inv.flagged && !inv.verified) return 'flagged';
  if (inv.status === 'PAID')        return 'paid';
  if (inv.status === 'DRAFT')       return 'draft';
  const today = new Date().toISOString().split('T')[0];
  if (inv.dueDate && inv.dueDate < today) return 'overdue';
  return 'pending';
}

function SortIcon({ active, dir }: { active: boolean; dir: SortDir }) {
  return (
    <span className={`ml-1 inline-block transition-colors ${active ? 'text-indigo-500' : 'text-gray-300'}`}>
      {active && dir === 'desc' ? '↓' : '↑'}
    </span>
  );
}

export default function InvoicesClient({ initialInvoices, companies }: { initialInvoices: Invoice[]; companies: Company[] }) {
  const [invoices, setInvoices]           = useState<Invoice[]>(initialInvoices);
  const [filterYear,    setFilterYear]    = useState<number | ''>('');
  const [filterMonth,   setFilterMonth]   = useState('');
  const [filterStatus,  setFilterStatus]  = useState('UNPAID');
  const [filterCompany, setFilterComp]    = useState('');
  const [filterFlagged, setFilterFlagged] = useState('');
  const [searchQuery,   setSearchQuery]   = useState('');
  const [sortKey,       setSortKey]       = useState<SortKey>('invoiceNumber');
  const [sortDir,       setSortDir]       = useState<SortDir>('desc');
  const [showGenerate,  setShowGenerate]  = useState(false);
  const [genForm, setGenForm]             = useState({ companyId: '', month: String(MONTHS[new Date().getMonth()]), year: new Date().getFullYear(), invoiceDate: '' });
  const [showPayModal, setShowPayModal] = useState(false);
  const [payInvId, setPayInvId]         = useState('');
  const [payMethod, setPayMethod]       = useState('');
  const [payRef, setPayRef]             = useState('');
  const [generating,    setGenerating]    = useState(false);
  const [genResult,     setGenResult]     = useState<{ invoiceId?: string; invoiceNumber?: number; flagged?: boolean; error?: string } | null>(null);

  function toggleSort(key: SortKey) {
    if (sortKey === key) {
      setSortDir((d) => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('asc');
    }
  }

  const sorted = useMemo(() => {
    const base = invoices.filter((inv) => {
      if (filterYear    && inv.year      !== filterYear)    return false;
      if (filterMonth   && inv.month     !== filterMonth)   return false;
      if (filterCompany && inv.companyId !== filterCompany) return false;
      if (filterStatus === 'UNPAID' && inv.status === 'PAID') return false;
      if (filterStatus === 'PAID'   && inv.status !== 'PAID') return false;
      if (filterFlagged === 'yes' && !(inv.flagged && !inv.verified)) return false;
      if (searchQuery) {
        const q = searchQuery.toLowerCase();
        if (!String(inv.invoiceNumber).includes(q) && !inv.company.companyName.toLowerCase().includes(q)) return false;
      }
      return true;
    });
    return [...base].sort((a, b) => {
      const v = sortKey === 'invoiceNumber'
        ? a.invoiceNumber - b.invoiceNumber
        : sortKey === 'total'
        ? a.total - b.total
        : a.company.companyName.localeCompare(b.company.companyName);
      return sortDir === 'asc' ? v : -v;
    });
  }, [invoices, filterYear, filterMonth, filterCompany, filterStatus, filterFlagged, searchQuery, sortKey, sortDir]);

  const totals = {
    invoiced: sorted.reduce((s, i) => s + i.total, 0),
    received: sorted.filter((i) => i.status === 'PAID').reduce((s, i) => s + i.total, 0),
    pending:  sorted.filter((i) => i.status === 'PENDING').reduce((s, i) => s + i.total, 0),
  };

  // Build lookup: companyId + month index → total, for flagging delta display
  const prevTotalMap = useMemo(() => {
    const MONTH_ORDER = ['January','February','March','April','May','June','July','August','September','October','November','December'];
    const map = new Map<string, number>();
    invoices.forEach((inv) => {
      map.set(`${inv.companyId}-${inv.year}-${inv.month}`, inv.total);
    });
    function getPrev(companyId: string, year: number, month: string): number | null {
      const idx = MONTH_ORDER.indexOf(month);
      if (idx === -1) return null;
      const prevMonth = idx === 0 ? MONTH_ORDER[11] : MONTH_ORDER[idx - 1];
      const prevYear  = idx === 0 ? year - 1 : year;
      return map.get(`${companyId}-${prevYear}-${prevMonth}`) ?? null;
    }
    return getPrev;
  }, [invoices]);

  async function patch(id: string, data: object) {
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) {
        const updated = await res.json();
        setInvoices((prev) => prev.map((i) => i.id === id ? { ...i, ...updated } : i));
      } else {
        alert('Failed to update invoice — please try again.');
      }
    } catch {
      alert('Network error — please try again.');
    }
  }

  async function deleteInvoice(id: string, invoiceNumber: number, status: string) {
    const warning = status !== 'DRAFT'
      ? `Delete Invoice #${invoiceNumber}? This invoice has already been ${status.toLowerCase()}. This cannot be undone. All rides in this invoice will also be permanently deleted.`
      : `Delete Invoice #${invoiceNumber}? This cannot be undone. All rides in this invoice will also be permanently deleted.`;
    if (!confirm(warning)) return;
    try {
      const res = await fetch(`/api/invoices/${id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        setInvoices((prev) => prev.filter((i) => i.id !== id));
      } else {
        alert('Delete failed — please try again.');
      }
    } catch {
      alert('Network error — please try again.');
    }
  }

  async function generate() {
    setGenerating(true); setGenResult(null);
    try {
      const payload = { ...genForm, ...(genForm.invoiceDate ? {} : { invoiceDate: undefined }) };
      const res  = await fetch('/api/invoices/generate', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setGenResult({ error: data.error ?? 'Failed' }); return; }
      setGenResult({ invoiceId: data.invoiceId, invoiceNumber: data.invoiceNumber, flagged: data.flagged });
      const updated = await fetch('/api/invoices').then((r) => { if (!r.ok) throw new Error(r.statusText); return r.json(); });
      setInvoices(updated);
    } catch { setGenResult({ error: 'Network error' }); }
    finally { setGenerating(false); }
  }

  return (
    <>
      <div className="space-y-6">
        <PageHeader
          title="Invoices"
          description={`${sorted.length === invoices.length ? invoices.length : `${sorted.length} of ${invoices.length}`} invoices`}
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

        {/* Filters + Search */}
        <div className="flex flex-wrap gap-3">
          {/* Search input */}
          <input
            type="text"
            value={searchQuery}
            onChange={(e) => setSearchQuery(e.target.value)}
            placeholder="Search invoice # or company…"
            className="h-9 w-56 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 placeholder-gray-400 focus:outline-none focus:ring-2 focus:ring-indigo-500"
          />
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
            <option value="UNPAID">Unpaid</option>
            <option value="PAID">Paid</option>
            <option value="">All</option>
          </Select>
          <Select value={filterFlagged} onChange={(e) => setFilterFlagged(e.target.value)} className="w-36">
            <option value="">All Invoices</option>
            <option value="yes">Flagged Only</option>
          </Select>
        </div>

        {sorted.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
            <p className="text-base font-semibold text-gray-900">No invoices found</p>
            <p className="mt-1 text-sm text-gray-500">{searchQuery ? 'Try a different search term.' : 'Generate your first invoice to get started.'}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {/* Sortable: Invoice # */}
                  <th
                    className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 cursor-pointer hover:text-gray-600 select-none"
                    onClick={() => toggleSort('invoiceNumber')}
                  >
                    Invoice #<SortIcon active={sortKey === 'invoiceNumber'} dir={sortDir} />
                  </th>
                  {/* Sortable: Company */}
                  <th
                    className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 cursor-pointer hover:text-gray-600 select-none"
                    onClick={() => toggleSort('companyName')}
                  >
                    Company<SortIcon active={sortKey === 'companyName'} dir={sortDir} />
                  </th>
                  <th
                    className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 cursor-pointer hover:text-gray-600 select-none"
                    onClick={() => toggleSort('total')}
                  >
                    Amount<SortIcon active={sortKey === 'total'} dir={sortDir} />
                  </th>
                  {['Period', 'Date Sent', 'Due Date', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {sorted.map((inv) => {
                  const sv = statusBadge(inv);
                  const isFlagged = inv.flagged && !inv.verified;
                  const isDraft   = inv.status === 'DRAFT';
                  return (
                    <tr key={inv.id} className={`group hover:bg-gray-50 transition-colors ${isFlagged ? 'border-l-4 border-l-red-400' : ''}`}>
                      <td className="px-4 py-3.5">
                        <Link href={`/invoices/${inv.id}`} className="font-mono text-sm font-semibold text-indigo-600 hover:text-indigo-800">
                          #{inv.invoiceNumber}
                        </Link>
                      </td>
                      <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{inv.company.companyName}</td>
                      <td className="px-4 py-3.5">
                        <span className="text-sm font-semibold text-gray-900">{formatCurrency(inv.total)}</span>
                        {isFlagged && (() => {
                          const prev = prevTotalMap(inv.companyId, inv.year, inv.month);
                          if (prev == null) return null;
                          const diff = inv.total - prev;
                          return (
                            <span className="ml-1.5 text-xs text-red-500" title={`Was ${formatCurrency(prev)} last month`}>
                              ↓ {formatCurrency(Math.abs(diff))}
                            </span>
                          );
                        })()}
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{inv.month} {inv.year}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{inv.dateSent || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{inv.dueDate || '—'}</td>
                      <td className="px-4 py-3.5">
                        <Badge variant={sv} />
                        {inv.status === 'PAID' && inv.paymentMethod && (
                          <span className="ml-1 text-[10px] text-gray-400">
                            {PAYMENT_METHODS.find(p => p.value === inv.paymentMethod)?.label ?? inv.paymentMethod}
                            {inv.paymentRef ? ` #${inv.paymentRef}` : ''}
                          </span>
                        )}
                      </td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => window.open(`/api/invoices/${inv.id}/pdf`, '_blank')}>PDF</Button>
                          <Link href={`/invoices/${inv.id}`}>
                            <Button size="sm" variant="ghost">Edit</Button>
                          </Link>
                          {inv.status !== 'PAID'
                            ? <Button size="sm" variant="ghost" onClick={() => { setPayInvId(inv.id); setPayMethod(''); setPayRef(''); setShowPayModal(true); }} className="text-emerald-600 hover:bg-emerald-50">Mark Paid</Button>
                            : <Button size="sm" variant="ghost" onClick={() => patch(inv.id, { status: 'PENDING' })}>Unpaid</Button>
                          }
                          {isFlagged && (
                            <Button size="sm" variant="ghost" onClick={() => patch(inv.id, { flagged: false, verified: true })} className="text-gray-400 hover:text-gray-600">Unflag</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteInvoice(inv.id, inv.invoiceNumber, inv.status)} className="text-red-500 hover:text-red-700 hover:bg-red-50">Delete</Button>
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
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Invoice Date <span className="text-xs font-normal text-gray-400">(optional — defaults to date sent)</span>
            </label>
            <input
              type="date"
              value={genForm.invoiceDate}
              onChange={(e) => setGenForm((f) => ({ ...f, invoiceDate: e.target.value }))}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
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

      {/* Mark Paid Modal */}
      <Modal open={showPayModal} onClose={() => setShowPayModal(false)} title="Mark Invoice as Paid">
        <div className="space-y-4">
          <p className="text-sm text-gray-500">Select payment method:</p>
          <div className="grid grid-cols-3 gap-2">
            {PAYMENT_METHODS.map((pm) => (
              <button
                key={pm.value}
                type="button"
                onClick={() => setPayMethod(pm.value)}
                className={`rounded-xl border-2 px-3 py-3 text-center transition-colors ${
                  payMethod === pm.value
                    ? 'border-emerald-500 bg-emerald-50 text-emerald-700'
                    : 'border-gray-200 text-gray-600 hover:border-gray-300'
                }`}
              >
                <p className="text-sm font-semibold">{pm.label}</p>
              </button>
            ))}
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Reference # <span className="text-xs font-normal text-gray-400">(optional)</span>
            </label>
            <input
              type="text" placeholder="e.g. cheque #, confirmation code"
              value={payRef} onChange={e => setPayRef(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-emerald-500"
            />
          </div>
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowPayModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={() => {
              const data: Record<string, string> = { status: 'PAID' };
              if (payMethod) data.paymentMethod = payMethod;
              if (payRef) data.paymentRef = payRef;
              patch(payInvId, data);
              setShowPayModal(false);
            }} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm Payment
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
