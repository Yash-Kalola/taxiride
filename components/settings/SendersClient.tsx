'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';

interface Sender {
  id:        string;
  label:     string;
  email:     string;
  isDefault: boolean;
  createdAt: string;
  updatedAt: string;
}

export default function SendersClient({ initial }: { initial: Sender[] }) {
  const [senders, setSenders] = useState<Sender[]>(initial);
  const [editing, setEditing] = useState<Sender | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const res = await fetch('/api/settings/senders');
    if (res.ok) setSenders(await res.json());
  }

  async function toggleDefault(s: Sender) {
    const res = await fetch(`/api/settings/senders/${s.id}`, {
      method:  'PATCH',
      headers: { 'Content-Type': 'application/json' },
      body:    JSON.stringify({ isDefault: !s.isDefault }),
    });
    if (res.ok) await refresh();
    else alert('Failed to update');
  }

  async function deleteSender(s: Sender) {
    if (!confirm(`Remove sender "${s.email}"? Existing email history is kept; this only removes it from the dropdown.`)) return;
    const res = await fetch(`/api/settings/senders/${s.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) await refresh();
    else alert('Failed to delete');
  }

  return (
    <>
      <PageHeader
        title="Email Senders"
        description="Configure which 'From' addresses appear in the email Send dialogs."
        action={<Button variant="primary" onClick={() => setCreating(true)}>Add Sender</Button>}
      />

      <div className="rounded-xl border border-amber-100 bg-amber-50 px-4 py-3 text-xs text-amber-800">
        All senders share the same outgoing SMTP server. For each address to actually send, your mail
        provider must permit sending as that address from the same SMTP user.
      </div>

      {senders.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-base font-semibold text-gray-900">No senders yet</p>
          <p className="mt-1 text-sm text-gray-500">Add one to enable the &quot;From&quot; picker on outgoing emails.</p>
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full text-sm">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {['Label', 'Email', 'Default', ''].map((h, i) => (
                  <th key={i} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-gray-50">
              {senders.map((s) => (
                <tr key={s.id} className="hover:bg-gray-50">
                  <td className="px-5 py-3.5 font-medium text-gray-900">{s.label}</td>
                  <td className="px-5 py-3.5 font-mono text-gray-700">{s.email}</td>
                  <td className="px-5 py-3.5">
                    <button
                      onClick={() => toggleDefault(s)}
                      className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium transition-colors ${
                        s.isDefault ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-200' : 'bg-slate-50 text-slate-500 hover:bg-slate-100'
                      }`}
                    >
                      {s.isDefault ? 'Default' : 'Set default'}
                    </button>
                  </td>
                  <td className="px-5 py-3.5 text-right">
                    <div className="flex items-center justify-end gap-1">
                      <Button size="sm" variant="ghost" onClick={() => setEditing(s)}>Edit</Button>
                      <Button size="sm" variant="ghost" onClick={() => deleteSender(s)} className="text-red-500 hover:bg-red-50">Delete</Button>
                    </div>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      )}

      {(creating || editing) && (
        <SenderModal
          initial={editing}
          onClose={() => { setCreating(false); setEditing(null); }}
          onSaved={async () => { setCreating(false); setEditing(null); await refresh(); }}
        />
      )}
    </>
  );
}

function SenderModal({
  initial, onClose, onSaved,
}: {
  initial: Sender | null;
  onClose: () => void;
  onSaved: () => void;
}) {
  const [label, setLabel] = useState(initial?.label ?? '');
  const [email, setEmail] = useState(initial?.email ?? '');
  const [isDefault, setIsDefault] = useState(initial?.isDefault ?? false);
  const [saving, setSaving] = useState(false);
  const [error, setError] = useState<string | null>(null);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null); setSaving(true);
    try {
      const res = await (initial
        ? fetch(`/api/settings/senders/${initial.id}`, {
            method:  'PATCH',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ label, email, isDefault }),
          })
        : fetch('/api/settings/senders', {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({ label, email, isDefault }),
          })
      );
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(typeof data?.error === 'string' ? data.error : 'Save failed');
        setSaving(false);
        return;
      }
      onSaved();
    } catch {
      setError('Network error');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-10">
      <div className="w-full max-w-md rounded-2xl bg-white shadow-xl">
        <form onSubmit={submit}>
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">
              {initial ? 'Edit sender' : 'Add sender'}
            </h2>
          </div>
          <div className="px-6 py-5 space-y-4">
            <Input
              label="Label"
              value={label}
              onChange={(e) => setLabel(e.target.value)}
              placeholder="e.g. Accounting"
              required
            />
            <Input
              label="Email address"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              placeholder="accounts@vetstaxis.ca"
              autoCapitalize="none"
              spellCheck={false}
              required
            />
            <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={isDefault}
                onChange={(e) => setIsDefault(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Default sender (pre-selected on Send dialogs)</span>
            </label>
            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
          </div>
          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? '\u2026' : initial ? 'Save changes' : 'Add sender'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
