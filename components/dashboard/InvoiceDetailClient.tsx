'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import { formatCurrency } from '@/lib/tax';

interface Company { companyName: string; address: string; poNumber: string; email: string; }
interface Ride { id: string; dateTime: string; pickupLocation: string; dropoffLocation: string; vehicleNumber: string; amount: number; voided: boolean; }
interface Invoice {
  id: string; invoiceNumber: number; month: string; year: number;
  amountPreTax: number; hst: number; total: number;
  dateSent: string; dueDate: string; status: string;
  notes: string; flagged: boolean; verified: boolean;
  paymentMethod?: string | null; paymentRef?: string;
  company: Company; rides: Ride[];
}

const PAYMENT_METHODS = [
  { value: 'DEBIT',      label: 'Debit' },
  { value: 'CREDIT',     label: 'Credit' },
  { value: 'E_TRANSFER', label: 'E-Transfer' },
  { value: 'CHEQUE',     label: 'Cheque' },
  { value: 'CASH',       label: 'Cash' },
  { value: 'OTHER',      label: 'Other' },
] as const;

export default function InvoiceDetailClient({ invoice: initial }: { invoice: Invoice }) {
  const router = useRouter();
  const [invoice,   setInvoice]   = useState(initial);
  const [rides,     setRides]     = useState<Ride[]>(initial.rides);
  const [notes,     setNotes]     = useState(initial.notes ?? '');
  const [dateSent,  setDateSent]  = useState(initial.dateSent ?? '');
  const [dueDate,   setDueDate]   = useState(initial.dueDate ?? '');
  const [saving,    setSaving]    = useState(false);
  const [savingDates, setSavingDates] = useState(false);
  const [sending,   setSending]   = useState(false);
  const [resending, setResending] = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [voidingId, setVoidingId] = useState<string | null>(null);
  const [msg,       setMsg]       = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);
  const [showPayModal, setShowPayModal] = useState(false);
  const [payMethod, setPayMethod]       = useState('');
  const [payRef, setPayRef]             = useState('');

  async function save() {
    setSaving(true); setMsg(null);
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ notes }),
    });
    if (res.ok) { setMsg({ type: 'ok', text: 'Notes saved.' }); }
    else { setMsg({ type: 'err', text: 'Save failed.' }); }
    setSaving(false);
  }

  async function saveDates() {
    setSavingDates(true); setMsg(null);
    const res = await fetch(`/api/invoices/${invoice.id}`, {
      method: 'PATCH', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ dateSent, dueDate }),
    });
    if (res.ok) {
      const updated = await res.json();
      setInvoice((prev) => ({ ...prev, dateSent: updated.dateSent ?? dateSent, dueDate: updated.dueDate ?? dueDate }));
      setMsg({ type: 'ok', text: 'Invoice dates saved.' });
    } else {
      setMsg({ type: 'err', text: 'Failed to save dates.' });
    }
    setSavingDates(false);
  }

  async function send() {
    if (!confirm(`Send Invoice #${invoice.invoiceNumber} to ${invoice.company.email || '(no email set)'}?`)) return;
    setSending(true); setMsg(null);
    const res = await fetch(`/api/invoices/${invoice.id}/send`, {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({
        ...(dateSent ? { dateSent } : {}),
        ...(dueDate  ? { dueDate }  : {}),
      }),
    });
    const data = await res.json();
    if (res.ok) {
      setInvoice((prev) => ({ ...prev, status: 'PENDING', dateSent: data.invoice.dateSent, dueDate: data.invoice.dueDate }));
      setDateSent(data.invoice.dateSent ?? '');
      setDueDate(data.invoice.dueDate ?? '');
      setMsg(data.emailError
        ? { type: 'warn', text: 'Invoice marked as sent. Email could not be delivered — check SMTP settings in Vercel.' }
        : { type: 'ok',  text: 'Invoice sent and emailed successfully.' }
      );
    } else {
      setMsg({ type: 'err', text: data.error ?? 'Send failed.' });
    }
    setSending(false);
  }

  async function deleteInvoice() {
    if (!confirm(`Delete Invoice #${invoice.invoiceNumber}? The invoice will be removed and its rides will return to Uninvoiced status so they can be re-invoiced.`)) return;
    setDeleting(true);
    const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      router.push('/invoices');
    } else {
      setMsg({ type: 'err', text: 'Delete failed — please try again.' });
      setDeleting(false);
    }
  }

  async function resend() {
    if (!confirm(`Resend Invoice #${invoice.invoiceNumber} to ${invoice.company.email || '(no email set)'}?`)) return;
    setResending(true); setMsg(null);
    const res  = await fetch(`/api/invoices/${invoice.id}/resend`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      setMsg(data.emailError
        ? { type: 'warn', text: 'Email could not be delivered — check SMTP settings in Vercel.' }
        : { type: 'ok',   text: 'Invoice re-sent successfully.' }
      );
    } else {
      setMsg({ type: 'err', text: data.error ?? 'Resend failed.' });
    }
    setResending(false);
  }

  async function confirmPaid() {
    const data: Record<string, string> = { status: 'PAID' };
    if (payMethod) data.paymentMethod = payMethod;
    if (payRef)    data.paymentRef = payRef;
    try {
      const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
      if (res.ok) {
        const updated = await res.json();
        setInvoice((prev) => ({ ...prev, ...updated, status: 'PAID' }));
        setMsg({ type: 'ok', text: 'Invoice marked as paid.' });
      } else {
        setMsg({ type: 'err', text: 'Failed to mark as paid.' });
      }
    } catch {
      setMsg({ type: 'err', text: 'Network error.' });
    }
    setShowPayModal(false);
  }

  async function voidRide(rideId: string) {
    setVoidingId(rideId);
    try {
      const res  = await fetch(`/api/rides/${rideId}/void`, { method: 'PATCH' });
      const data = await res.json();
      if (!res.ok) { setMsg({ type: 'err', text: data.error ?? 'Failed to void ride.' }); return; }
      // Update ride voided status
      setRides((prev) => prev.map((r) => r.id === rideId ? { ...r, voided: data.ride.voided } : r));
      // Update invoice totals
      if (data.invoice) {
        setInvoice((prev) => ({
          ...prev,
          amountPreTax: data.invoice.amountPreTax,
          hst:          data.invoice.hst,
          total:        data.invoice.total,
        }));
      }
    } catch { setMsg({ type: 'err', text: 'Network error.' }); }
    finally { setVoidingId(null); }
  }

  const voidedCount  = rides.filter((r) => r.voided).length;
  const activeRides  = rides.filter((r) => !r.voided);

  const sv = invoice.flagged && !invoice.verified ? 'flagged' : invoice.status === 'PAID' ? 'paid' : invoice.status === 'DRAFT' ? 'draft' : 'pending';

  return (
    <div className="space-y-6 max-w-4xl">
      {/* Header */}
      <div className="flex items-start justify-between">
        <div>
          <div className="flex items-center gap-3">
            <Link href="/invoices" className="text-sm text-gray-400 hover:text-gray-600">← Invoices</Link>
          </div>
          <h1 className="mt-2 text-2xl font-bold text-gray-900">Invoice #{invoice.invoiceNumber}</h1>
          <p className="mt-1 text-sm text-gray-500">{invoice.company.companyName} · {invoice.month} {invoice.year}</p>
        </div>
        <div className="flex items-center gap-3">
          <div className="flex items-center gap-1.5">
            <Badge variant={sv} />
            {invoice.status === 'PAID' && invoice.paymentMethod && (
              <span className="text-[11px] text-gray-400">
                {PAYMENT_METHODS.find(p => p.value === invoice.paymentMethod)?.label ?? invoice.paymentMethod}
                {invoice.paymentRef ? ` #${invoice.paymentRef}` : ''}
              </span>
            )}
          </div>
          <Button variant="secondary" onClick={() => window.open(`/api/invoices/${invoice.id}/pdf`, '_blank')}>
            Download PDF
          </Button>
          {invoice.status === 'DRAFT' && (
            <Button variant="danger" onClick={deleteInvoice} disabled={deleting}>
              {deleting ? 'Deleting…' : 'Delete'}
            </Button>
          )}
          {invoice.status !== 'PAID' && (
            <>
              {invoice.status === 'DRAFT' && (
                <div className="flex flex-col items-end gap-1">
                  <Button
                    variant={invoice.company.email ? 'primary' : 'secondary'}
                    onClick={send}
                    disabled={sending}
                  >
                    {sending ? 'Sending…' : 'Send Invoice'}
                  </Button>
                  {!invoice.company.email && (
                    <p className="text-xs text-amber-600 max-w-[220px] text-right">
                      No email on file — invoice will be marked Sent but not emailed.
                    </p>
                  )}
                </div>
              )}
              {invoice.status === 'PENDING' && (
                <Button variant="primary" onClick={() => { setPayMethod(''); setPayRef(''); setShowPayModal(true); }} className="bg-emerald-600 hover:bg-emerald-700">Mark as Paid</Button>
              )}
            </>
          )}
          {invoice.status !== 'DRAFT' && invoice.company.email && (
            <Button variant="secondary" onClick={resend} disabled={resending}>
              {resending ? 'Sending…' : 'Resend Email'}
            </Button>
          )}
        </div>
      </div>

      {msg && (
        <div className={`rounded-xl px-4 py-3 text-sm ${
        msg.type === 'ok'   ? 'bg-emerald-50 text-emerald-700' :
        msg.type === 'warn' ? 'bg-amber-50 text-amber-700'     :
                              'bg-red-50 text-red-600'
      }`}>
          {msg.text}
        </div>
      )}

      {/* Detail cards */}
      <div className="grid grid-cols-2 gap-6">
        {/* Bill To */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Bill To</p>
          <p className="font-semibold text-gray-900">{invoice.company.companyName}</p>
          <p className="text-sm text-gray-500 mt-1 whitespace-pre-line">{invoice.company.address}</p>
          {invoice.company.poNumber && <p className="text-sm text-gray-700 mt-2">PO # {invoice.company.poNumber}</p>}
        </div>

        {/* Invoice meta */}
        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Details</p>
          {/* Invoice # */}
          <div className="flex justify-between py-1.5 text-sm border-b border-gray-50">
            <span className="text-gray-500">Invoice #</span>
            <span className="font-medium text-gray-900">#{invoice.invoiceNumber}</span>
          </div>
          {/* Editable Invoice Date */}
          <div className="flex justify-between items-center py-1.5 text-sm border-b border-gray-50">
            <span className="text-gray-500">Invoice Date</span>
            <input
              type="date"
              className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-[160px] text-right"
              value={dateSent}
              onChange={(e) => setDateSent(e.target.value)}
            />
          </div>
          {/* Editable Due Date */}
          <div className="flex justify-between items-center py-1.5 text-sm border-b border-gray-50">
            <span className="text-gray-500">Due Date</span>
            <input
              type="date"
              className="rounded-md border border-gray-200 px-2 py-1 text-sm text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-500 w-[160px] text-right"
              value={dueDate}
              onChange={(e) => setDueDate(e.target.value)}
            />
          </div>
          {/* Save Dates button — show when dates changed */}
          {(dateSent !== (invoice.dateSent ?? '') || dueDate !== (invoice.dueDate ?? '')) && (
            <div className="mt-2 flex justify-end">
              <button
                onClick={saveDates}
                disabled={savingDates}
                className="text-xs font-medium text-indigo-600 hover:text-indigo-800 disabled:opacity-50"
              >
                {savingDates ? 'Saving…' : 'Save Dates'}
              </button>
            </div>
          )}
          {/* Totals */}
          {[
            ['Subtotal',  formatCurrency(invoice.amountPreTax)],
            ['HST (13%)', formatCurrency(invoice.hst)],
            ['Total',     formatCurrency(invoice.total)],
          ].map(([k, v]) => (
            <div key={k} className="flex justify-between py-1.5 text-sm border-b border-gray-50 last:border-0">
              <span className="text-gray-500">{k}</span>
              <span className={`font-medium text-gray-900 ${k === 'Total' ? 'text-indigo-600 font-bold' : ''}`}>{v}</span>
            </div>
          ))}
        </div>
      </div>

      {/* Notes */}
      <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200">
        <p className="text-xs font-bold uppercase tracking-widest text-gray-400 mb-3">Notes (printed on invoice)</p>
        <textarea
          className="w-full rounded-lg border border-gray-200 px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500 resize-none"
          rows={3}
          value={notes}
          onChange={(e) => setNotes(e.target.value)}
          placeholder="Add any notes to include on the invoice…"
        />
        <div className="mt-3 flex justify-end">
          <Button size="sm" variant="secondary" onClick={save} disabled={saving}>{saving ? 'Saving…' : 'Save Notes'}</Button>
        </div>
      </div>

      {/* Rides */}
      {rides.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="px-6 py-4 border-b border-gray-100 flex items-center justify-between">
            <div className="flex items-center gap-3">
              <p className="text-sm font-semibold text-gray-900">
                Rides ({activeRides.length} active{voidedCount > 0 ? `, ${voidedCount} voided` : ''})
              </p>
              {voidedCount > 0 && (
                <span className="rounded-full bg-red-50 px-2 py-0.5 text-xs font-medium text-red-600 ring-1 ring-red-200">
                  {voidedCount} ride{voidedCount !== 1 ? 's' : ''} voided — excluded from invoice
                </span>
              )}
            </div>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Date/Time', 'Pickup', 'Dropoff', 'Cab #', 'Amount', ''].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {rides.map((r) => (
                <tr key={r.id} className={`group transition-colors ${r.voided ? 'bg-red-50/40 opacity-60' : 'hover:bg-gray-50'}`}>
                  <td className={`px-5 py-3 text-sm text-gray-600 ${r.voided ? 'line-through' : ''}`}>{r.dateTime || '—'}</td>
                  <td className={`px-5 py-3 text-sm text-gray-600 max-w-[160px] truncate ${r.voided ? 'line-through' : ''}`}>{r.pickupLocation || '—'}</td>
                  <td className={`px-5 py-3 text-sm text-gray-600 max-w-[160px] truncate ${r.voided ? 'line-through' : ''}`}>{r.dropoffLocation || '—'}</td>
                  <td className={`px-5 py-3 text-sm font-mono text-gray-600 ${r.voided ? 'line-through' : ''}`}>{r.vehicleNumber || '—'}</td>
                  <td className={`px-5 py-3 text-sm font-semibold ${r.voided ? 'text-red-400 line-through' : 'text-gray-900'}`}>
                    {r.voided && <span className="mr-1.5 text-xs font-bold text-red-500 not-italic no-underline" style={{ textDecoration: 'none' }}>VOID</span>}
                    {formatCurrency(r.amount)}
                  </td>
                  <td className="px-5 py-3">
                    <button
                      onClick={() => voidRide(r.id)}
                      disabled={voidingId === r.id}
                      className={`opacity-0 group-hover:opacity-100 transition-opacity text-xs font-medium px-2 py-1 rounded-md ${
                        r.voided
                          ? 'text-emerald-600 hover:bg-emerald-50 border border-emerald-200'
                          : 'text-red-600 hover:bg-red-50 border border-red-200'
                      } disabled:opacity-40`}
                    >
                      {voidingId === r.id ? '…' : r.voided ? 'Unvoid' : 'Void'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

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
            <Button variant="primary" onClick={confirmPaid} className="bg-emerald-600 hover:bg-emerald-700">
              Confirm Payment
            </Button>
          </div>
        </div>
      </Modal>
    </div>
  );
}
