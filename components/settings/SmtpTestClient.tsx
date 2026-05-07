'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import EmailErrorBanner from '@/components/email/EmailErrorBanner';

interface TestResult {
  step:    'connect' | 'send';
  success: boolean;
  config:  { host: string; port: number; secure: boolean; user: string; from: string };
  error:   string | null;
}

/**
 * Diagnostic widget for verifying SMTP credentials. Connects to the
 * configured SMTP server, authenticates, and (if successful) sends a
 * one-line test email to a recipient the user types in. Shows a
 * specific error at the failure step (connect vs. send), with the
 * friendly EmailErrorBanner translating Microsoft 365 / nodemailer
 * errors into plain-English next steps.
 */
export default function SmtpTestClient() {
  const [recipient, setRecipient] = useState('');
  const [testing,   setTesting]   = useState(false);
  const [result,    setResult]    = useState<TestResult | null>(null);
  const [networkErr, setNetworkErr] = useState<string | null>(null);

  async function runTest() {
    if (!recipient) return;
    setTesting(true);
    setResult(null);
    setNetworkErr(null);
    try {
      const res = await fetch('/api/settings/email/test-smtp', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({ recipient }),
      });
      const contentType = res.headers.get('content-type') || '';
      if (!contentType.includes('application/json')) {
        setNetworkErr(`Server returned ${res.status} ${res.statusText} (non-JSON). The deploy may still be in progress.`);
        return;
      }
      const data = await res.json();
      if (!res.ok && !data?.step) {
        setNetworkErr(typeof data?.error === 'string' ? data.error : 'Test request failed.');
        return;
      }
      setResult(data);
    } catch (err: any) {
      setNetworkErr(`Network error: ${err?.message ?? 'unknown'}`);
    } finally {
      setTesting(false);
    }
  }

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h3 className="text-sm font-semibold text-gray-900">SMTP Diagnostic</h3>
          <p className="mt-1 text-xs text-gray-500">
            Verify the email server credentials and send a one-line test email.
            Use this to check whether invoices will deliver before sending one.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-[1fr_auto] gap-3 items-end">
        <Input
          label="Send test to"
          type="email"
          placeholder="you@example.com"
          value={recipient}
          onChange={(e) => setRecipient(e.target.value)}
          hint="Use any email you can check — e.g. your own inbox."
        />
        <Button variant="primary" onClick={runTest} disabled={testing || !recipient}>
          {testing ? 'Testing…' : 'Run SMTP test'}
        </Button>
      </div>

      {networkErr && (
        <div className="mt-4 rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
          {networkErr}
        </div>
      )}

      {result && (
        <div className="mt-4 space-y-3">
          {/* Status banner */}
          {result.success ? (
            <div className="rounded-xl bg-emerald-50 px-4 py-3 text-sm text-emerald-800 ring-1 ring-emerald-200">
              <p className="font-semibold">✓ SMTP is working</p>
              <p className="mt-0.5 text-emerald-700">
                Connected to {result.config.host}:{result.config.port} as {result.config.user} and delivered the test email to <strong>{recipient}</strong>. Check that inbox to confirm.
              </p>
            </div>
          ) : (
            <div className="space-y-2">
              <p className="text-xs font-semibold uppercase tracking-wide text-gray-500">
                Failed at: {result.step === 'connect' ? 'Server connection / authentication' : 'Sending email'}
              </p>
              <EmailErrorBanner rawError={result.error} />
            </div>
          )}

          {/* Active config (no password — just the public bits) */}
          <details className="rounded-lg border border-gray-200 bg-gray-50 px-3 py-2 text-xs text-gray-600">
            <summary className="cursor-pointer font-medium text-gray-700">Current SMTP configuration</summary>
            <dl className="mt-2 grid grid-cols-[120px_1fr] gap-y-1 font-mono">
              <dt className="text-gray-400">Host</dt>           <dd>{result.config.host}</dd>
              <dt className="text-gray-400">Port</dt>           <dd>{result.config.port}</dd>
              <dt className="text-gray-400">Secure (TLS)</dt>   <dd>{String(result.config.secure)}</dd>
              <dt className="text-gray-400">Username</dt>       <dd>{result.config.user}</dd>
              <dt className="text-gray-400">Sends as (From)</dt><dd>{result.config.from}</dd>
            </dl>
            <p className="mt-2 text-gray-500">
              These come from environment variables (<code>SMTP_HOST</code>, <code>SMTP_PORT</code>, <code>SMTP_SECURE</code>, <code>SMTP_USER</code>, <code>SMTP_PASS</code>, <code>EMAIL_FROM</code>) on the deploy. Update them in Vercel → Settings → Environment Variables.
            </p>
          </details>
        </div>
      )}
    </div>
  );
}
