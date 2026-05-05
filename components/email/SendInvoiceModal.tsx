'use client';
import { useEffect, useState } from 'react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import { formatCurrency } from '@/lib/tax';

interface Sender { id: string; label: string; email: string; isDefault: boolean; }

/**
 * Confirm-and-send dialog for an invoice with a "From" picker. Calls whatever
 * endpoint the caller provides (send or resend) with `{ from, ...extraPayload }`.
 */
export default function SendInvoiceModal({
  open, title, mode,
  endpoint,
  invoiceNumber, companyName, recipientEmail, total, extraPayload,
  onClose, onSent,
}: {
  open:           boolean;
  title:          string;
  mode:           'send' | 'resend';
  endpoint:       string;
  invoiceNumber:  number;
  companyName:    string;
  recipientEmail: string;
  total:          number;
  extraPayload?:  Record<string, unknown>;
  onClose:        () => void;
  onSent:         (data: { emailError?: string | null; invoice?: unknown }) => void;
}) {
  const [senders, setSenders] = useState<Sender[]>([]);
  const [from,    setFrom]    = useState('');
  const [sending, setSending] = useState(false);
  const [error,   setError]   = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setError(null); setSending(false);
    fetch('/api/settings/senders')
      .then((r) => r.ok ? r.json() : [])
      .then((data: Sender[]) => {
        setSenders(Array.isArray(data) ? data : []);
        if (Array.isArray(data) && data.length > 0) {
          setFrom((data.find((s) => s.isDefault) ?? data[0]).email);
        } else {
          setFrom('');
        }
      })
      .catch(() => setSenders([]));
  }, [open]);

  async function submit() {
    setSending(true); setError(null);
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...(extraPayload ?? {}), ...(from ? { from } : {}) }),
      });
      // Handle non-JSON responses (e.g. when the server returns an HTML error page)
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setError(res.ok ? 'Unexpected response from server' : `Server error (${res.status}) — check that the database is configured correctly.`);
        setSending(false);
        return;
      }
      const data = await res.json().catch(() => ({} as any));
      if (!res.ok) {
        setError(typeof data?.error === 'string' ? data.error : 'Send failed — please try again.');
        setSending(false);
        return;
      }
      onSent(data);
    } catch {
      setError('Network error — check your connection and try again');
      setSending(false);
    }
  }

  if (!open) return null;

  const hasSenders = senders.length > 0;
  const hasRecipient = !!recipientEmail;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          <p className="mt-0.5 text-sm text-gray-500">
            {mode === 'send' ? 'The invoice will be marked Pending and emailed with the PDF attached.' : 'The same invoice PDF will be re-sent. Status stays unchanged.'}
          </p>
        </div>

        <div className="px-6 py-5 space-y-4">
          <div className="rounded-xl bg-gray-50 px-4 py-3 ring-1 ring-gray-100 text-sm">
            <div className="flex justify-between py-0.5"><span className="text-gray-500">Invoice</span><span className="font-medium text-gray-900">#{invoiceNumber}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-gray-500">Company</span><span className="font-medium text-gray-900">{companyName}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-gray-500">To</span><span className="font-medium text-gray-900">{recipientEmail || <em className="text-amber-600">no email on file</em>}</span></div>
            <div className="flex justify-between py-0.5"><span className="text-gray-500">Total</span><span className="font-semibold text-indigo-600">{formatCurrency(total)}</span></div>
          </div>

          {!hasSenders && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No senders configured. The invoice will use the default SMTP address from server settings. Add senders in <span className="font-semibold">Settings → Email Senders</span> to pick a From address here.
            </div>
          )}

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">From</label>
            <Select value={from} onChange={(e) => setFrom(e.target.value)} disabled={!hasSenders}>
              {senders.map((s) => (
                <option key={s.id} value={s.email}>{s.label} · {s.email}</option>
              ))}
              {!hasSenders && <option value="">(server default)</option>}
            </Select>
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <Button variant="ghost" onClick={onClose} disabled={sending}>Cancel</Button>
          <Button variant="primary" onClick={submit} disabled={sending || (mode === 'resend' && !hasRecipient)}>
            {sending ? 'Sending\u2026' : mode === 'send' ? 'Send invoice' : 'Resend email'}
          </Button>
        </div>
      </div>
    </div>
  );
}
