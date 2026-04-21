'use client';
import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';

interface Sender { id: string; label: string; email: string; isDefault: boolean; }

/**
 * Generic "Send by Email" dialog. Caller provides the `endpoint` to POST the
 * send to (`/api/drivers/:id/email-report`, `/api/brokers/:id/email-statement`,
 * etc.) and a `payload` that will be merged with `{ to, from, subject, message }`.
 * Recipient email is pre-filled from `defaultTo` and is editable so the office
 * can redirect a one-off send without editing the underlying record.
 */
export default function SendEmailModal({
  open, title, description,
  endpoint,
  defaultTo,
  defaultSubject,
  defaultMessage,
  extraPayload,
  onClose,
  onSent,
}: {
  open:            boolean;
  title:           string;
  description?:    string;
  endpoint:        string;
  defaultTo:       string;
  defaultSubject:  string;
  defaultMessage:  string;
  extraPayload:    Record<string, unknown>;
  onClose:         () => void;
  onSent:          () => void;
}) {
  const [to, setTo]             = useState(defaultTo);
  const [subject, setSubject]   = useState(defaultSubject);
  const [message, setMessage]   = useState(defaultMessage);
  const [senders, setSenders]   = useState<Sender[]>([]);
  const [from, setFrom]         = useState('');
  const [saving, setSaving]     = useState(false);
  const [error, setError]       = useState<string | null>(null);

  useEffect(() => {
    if (!open) return;
    setTo(defaultTo);
    setSubject(defaultSubject);
    setMessage(defaultMessage);
    setError(null);
    setSaving(false);
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
  }, [open, defaultTo, defaultSubject, defaultMessage]);

  const hasSenders = senders.length > 0;

  const canSend = useMemo(() => !saving && !!to && !!from && !!subject, [saving, to, from, subject]);

  async function send() {
    setError(null); setSaving(true);
    try {
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ ...extraPayload, to, from, subject, message }),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === 'string' ? data.error : 'Send failed');
        setSaving(false);
        return;
      }
      onSent();
    } catch {
      setError('Network error — try again');
      setSaving(false);
    }
  }

  if (!open) return null;

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-8 overflow-y-auto">
      <div className="w-full max-w-xl rounded-2xl bg-white shadow-xl">
        <div className="px-6 py-5 border-b border-gray-100">
          <h2 className="text-lg font-semibold text-gray-900">{title}</h2>
          {description && <p className="mt-0.5 text-sm text-gray-500">{description}</p>}
        </div>

        <div className="px-6 py-5 space-y-4">
          {!hasSenders && (
            <div className="rounded-lg border border-amber-200 bg-amber-50 px-3 py-2 text-sm text-amber-800">
              No senders configured yet. Add at least one from <span className="font-semibold">Settings → Email Senders</span>.
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">From</label>
              <Select value={from} onChange={(e) => setFrom(e.target.value)} disabled={!hasSenders}>
                {senders.map((s) => (
                  <option key={s.id} value={s.email}>{s.label} · {s.email}</option>
                ))}
                {!hasSenders && <option value="">(no senders configured)</option>}
              </Select>
            </div>
            <Input label="To" type="email" value={to} onChange={(e) => setTo(e.target.value)} required />
          </div>

          <Input label="Subject" value={subject} onChange={(e) => setSubject(e.target.value)} required />

          <div className="flex flex-col gap-1.5">
            <label className="text-sm font-medium text-gray-700">Message</label>
            <textarea
              value={message}
              onChange={(e) => setMessage(e.target.value)}
              rows={6}
              className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
            />
          </div>

          {error && (
            <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
          )}
        </div>

        <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
          <Button variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
          <Button variant="primary" onClick={send} disabled={!canSend || !hasSenders}>
            {saving ? 'Sending\u2026' : 'Send email'}
          </Button>
        </div>
      </div>
    </div>
  );
}
