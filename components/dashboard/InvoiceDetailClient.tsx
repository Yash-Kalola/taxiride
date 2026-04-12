'use client';
import { useState } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Input from '@/components/ui/Input';
import { formatCurrency } from '@/lib/tax';

interface Company { companyName: string; address: string; poNumber: string; email: string; }
interface Ride { id: string; dateTime: string; pickupLocation: string; dropoffLocation: string; vehicleNumber: string; amount: number; }
interface Invoice {
  id: string; invoiceNumber: number; month: string; year: number;
  amountPreTax: number; hst: number; total: number;
  dateSent: string; dueDate: string; status: string;
  notes: string; flagged: boolean; verified: boolean;
  company: Company; rides: Ride[];
}

export default function InvoiceDetailClient({ invoice: initial }: { invoice: Invoice }) {
  const router = useRouter();
  const [invoice, setInvoice]   = useState(initial);
  const [notes,   setNotes]     = useState(initial.notes ?? '');
  const [saving,    setSaving]    = useState(false);
  const [sending,   setSending]   = useState(false);
  const [resending, setResending] = useState(false);
  const [deleting,  setDeleting]  = useState(false);
  const [msg,       setMsg]       = useState<{ type: 'ok' | 'warn' | 'err'; text: string } | null>(null);

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

  async function send() {
    if (!confirm(`Send Invoice #${invoice.invoiceNumber} to ${invoice.company.email || '(no email set)'}?`)) return;
    setSending(true); setMsg(null);
    const res = await fetch(`/api/invoices/${invoice.id}/send`, { method: 'POST' });
    const data = await res.json();
    if (res.ok) {
      setInvoice((prev) => ({ ...prev, status: 'PENDING', dateSent: data.invoice.dateSent }));
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

  async function markPaid() {
    const res = await fetch(`/api/invoices/${invoice.id}`, { method: 'PATCH', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify({ status: 'PAID' }) });
    if (res.ok) setInvoice((prev) => ({ ...prev, status: 'PAID' }));
  }

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
          <Badge variant={sv} />
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
                <Button variant="primary" onClick={markPaid} className="bg-emerald-600 hover:bg-emerald-700">Mark as Paid</Button>
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
          {[
            ['Invoice #',     `#${invoice.invoiceNumber}`],
            ['Date Sent',     invoice.dateSent || '—'],
            ['Due Date',      invoice.dueDate  || '—'],
            ['Subtotal',      formatCurrency(invoice.amountPreTax)],
            ['HST (13%)',     formatCurrency(invoice.hst)],
            ['Total',         formatCurrency(invoice.total)],
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
      {invoice.rides.length > 0 && (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="px-6 py-4 border-b border-gray-100">
            <p className="text-sm font-semibold text-gray-900">Rides ({invoice.rides.length})</p>
          </div>
          <table className="w-full">
            <thead>
              <tr className="bg-gray-50 border-b border-gray-100">
                {['Date/Time', 'Pickup', 'Dropoff', 'Cab #', 'Amount'].map((h) => (
                  <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {invoice.rides.map((r) => (
                <tr key={r.id} className="hover:bg-gray-50 transition-colors">
                  <td className="px-5 py-3 text-sm text-gray-600">{r.dateTime || '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 max-w-[160px] truncate">{r.pickupLocation || '—'}</td>
                  <td className="px-5 py-3 text-sm text-gray-600 max-w-[160px] truncate">{r.dropoffLocation || '—'}</td>
                  <td className="px-5 py-3 text-sm font-mono text-gray-600">{r.vehicleNumber || '—'}</td>
                  <td className="px-5 py-3 text-sm font-semibold text-gray-900">{formatCurrency(r.amount)}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}
    </div>
  );
}
