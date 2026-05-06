'use client';
import { useEffect, useMemo, useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';

interface Template { subject: string; intro: string; closing: string; }

const PLACEHOLDERS: { tag: string; sample: string; desc: string }[] = [
  { tag: '{{companyName}}',   sample: 'ABC Transport Ltd.',  desc: "The recipient company's name" },
  { tag: '{{invoiceNumber}}', sample: '1596',                 desc: 'Invoice number (e.g. 1596)' },
  { tag: '{{month}}',         sample: 'March',                desc: 'Invoice month (e.g. March)' },
  { tag: '{{year}}',          sample: '2026',                 desc: 'Invoice year (e.g. 2026)' },
  { tag: '{{total}}',         sample: '$966.00',              desc: 'Amount due, formatted' },
  { tag: '{{dueDate}}',       sample: 'April 30, 2026',       desc: 'Payment due date' },
];

export default function EmailTemplateClient({
  initial, defaults,
}: {
  initial:  Template;
  defaults: Template;
}) {
  const [subject, setSubject] = useState(initial.subject);
  const [intro,   setIntro]   = useState(initial.intro);
  const [closing, setClosing] = useState(initial.closing);
  const [saving,  setSaving]  = useState(false);
  const [savedAt, setSavedAt] = useState<Date | null>(null);
  const [error,   setError]   = useState<string | null>(null);

  // Track the last-saved snapshot so the pristine check stays accurate after
  // saving (mutating the `initial` prop doesn't trigger React re-renders, so
  // we keep our own copy that we update on save).
  const [saved, setSaved] = useState<Template>(initial);

  const [previewHtml,    setPreviewHtml]    = useState<string>('');
  const [previewSubject, setPreviewSubject] = useState<string>('');

  const current = useMemo(() => ({ subject, intro, closing }), [subject, intro, closing]);
  const pristine = useMemo(() =>
    current.subject === saved.subject &&
    current.intro   === saved.intro &&
    current.closing === saved.closing,
    [current, saved],
  );

  // Debounced live preview — fetch the rendered HTML from the server so the
  // office sees exactly what the final email will look like.
  useEffect(() => {
    const t = setTimeout(async () => {
      try {
        const res = await fetch('/api/settings/email/preview', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(current),
        });
        if (res.ok) {
          const { subject: s, html } = await res.json();
          setPreviewSubject(s);
          setPreviewHtml(html);
        }
      } catch {}
    }, 250);
    return () => clearTimeout(t);
  }, [current]);

  async function save() {
    setSaving(true); setError(null);
    try {
      const res = await fetch('/api/settings/email', {
        method:  'PUT',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(current),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!res.ok) {
        if (contentType.includes('application/json')) {
          const data = await res.json().catch(() => null);
          // Surface field-level zod errors when present
          if (data?.error?.fieldErrors) {
            const fieldMsgs = Object.entries(data.error.fieldErrors)
              .map(([field, msgs]) => `${field}: ${(msgs as string[]).join(', ')}`).join(' · ');
            setError(`Validation failed — ${fieldMsgs}`);
          } else {
            setError(typeof data?.error === 'string' ? data.error : 'Save failed. Try again.');
          }
        } else {
          setError(`Server error (${res.status}) — check that the database is configured correctly.`);
        }
      } else {
        const savedRow = await res.json();
        // Update our internal "saved" snapshot so the pristine check works on
        // subsequent edits without needing to reload the page.
        setSaved({ subject: savedRow.subject, intro: savedRow.intro, closing: savedRow.closing });
        setSavedAt(new Date());
      }
    } catch {
      setError('Network error. Try again.');
    } finally {
      setSaving(false);
    }
  }

  function resetToDefaults() {
    if (!confirm('Reset subject, intro, and closing to the original defaults? You will still need to click Save.')) return;
    setSubject(defaults.subject);
    setIntro(defaults.intro);
    setClosing(defaults.closing);
  }

  return (
    <>
      <PageHeader
        title="Email Template"
        description="Customize the message that goes out with every invoice email."
        action={
          <div className="flex items-center gap-2">
            <Button variant="ghost" onClick={resetToDefaults} disabled={saving}>Reset to defaults</Button>
            <Button variant="primary" onClick={save} disabled={saving || pristine}>
              {saving ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        }
      />

      {savedAt && (
        <div className="rounded-xl border border-emerald-200 bg-emerald-50 px-4 py-3 text-sm text-emerald-800">
          Saved {savedAt.toLocaleTimeString()}. New emails will use this template.
        </div>
      )}
      {error && (
        <div className="rounded-xl border border-red-200 bg-red-50 px-4 py-3 text-sm text-red-700">{error}</div>
      )}

      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Editor */}
        <div className="space-y-6">
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6 space-y-5">
            <Input
              label="Subject line"
              value={subject}
              onChange={(e) => setSubject(e.target.value)}
              hint="Shown in the recipient's inbox."
            />

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Intro message</label>
              <textarea
                value={intro}
                onChange={(e) => setIntro(e.target.value)}
                rows={4}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-500">First paragraph of the email, right below the greeting.</p>
            </div>

            <div className="flex flex-col gap-1.5">
              <label className="text-sm font-medium text-gray-700">Closing message</label>
              <textarea
                value={closing}
                onChange={(e) => setClosing(e.target.value)}
                rows={6}
                className="w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-900 shadow-sm focus:outline-none focus:ring-2 focus:ring-indigo-500 focus:border-indigo-500"
              />
              <p className="text-xs text-gray-500">Shown after the summary table. Use a blank line for a paragraph break.</p>
            </div>
          </div>

          {/* Placeholders reference */}
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6">
            <h3 className="text-sm font-semibold text-gray-900">Placeholders</h3>
            <p className="mt-1 text-xs text-gray-500">
              Paste any of these into the fields above. They&apos;ll be replaced with real values when the email goes out.
            </p>
            <div className="mt-4 divide-y divide-gray-100">
              {PLACEHOLDERS.map((p) => (
                <div key={p.tag} className="flex items-center justify-between py-2.5 text-sm">
                  <div className="flex items-center gap-3">
                    <code className="rounded bg-gray-100 px-2 py-0.5 font-mono text-xs text-indigo-700">{p.tag}</code>
                    <span className="text-gray-600">{p.desc}</span>
                  </div>
                  <span className="text-xs text-gray-400 italic">→ {p.sample}</span>
                </div>
              ))}
            </div>
          </div>
        </div>

        {/* Preview */}
        <div className="space-y-3">
          <div className="flex items-center justify-between">
            <h3 className="text-sm font-semibold text-gray-900">Live preview</h3>
            <span className="text-xs text-gray-400">Uses sample data</span>
          </div>
          <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 overflow-hidden">
            <div className="px-5 py-3 border-b border-gray-100 bg-gray-50">
              <p className="text-[11px] font-semibold uppercase tracking-widest text-gray-400">Subject</p>
              <p className="mt-1 text-sm font-medium text-gray-900 truncate">{previewSubject || 'Loading…'}</p>
            </div>
            <EmailPreviewFrame html={previewHtml} />
          </div>
        </div>
      </div>
    </>
  );
}

function EmailPreviewFrame({ html }: { html: string }) {
  return (
    <iframe
      title="Email preview"
      srcDoc={html}
      sandbox=""
      className="block w-full h-[680px] bg-gray-50"
    />
  );
}
