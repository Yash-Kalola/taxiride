'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';

export default function LoginClient({ needsSetup, nextPath }: {
  needsSetup: boolean;
  nextPath:   string;
}) {
  const [username, setUsername] = useState('');
  const [password, setPassword] = useState('');
  const [displayName, setDisplayName] = useState('');
  const [confirm, setConfirm] = useState('');
  const [error, setError]   = useState<string | null>(null);
  const [loading, setLoading] = useState(false);

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (needsSetup) {
      if (password.length < 8) { setError('Password must be at least 8 characters'); return; }
      if (password !== confirm) { setError('Passwords don\u2019t match'); return; }
    }

    setLoading(true);
    try {
      const endpoint = needsSetup ? '/api/auth/setup' : '/api/auth/login';
      const body = needsSetup
        ? { username: username.trim().toLowerCase(), displayName: displayName.trim() || undefined, password }
        : { username: username.trim().toLowerCase(), password };
      const res = await fetch(endpoint, {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify(body),
      });
      if (!res.ok) {
        const data = await res.json().catch(() => null);
        setError(
          typeof data?.error === 'string'
            ? data.error
            : needsSetup
              ? 'Could not create admin account. Check your input.'
              : 'Invalid username or password',
        );
        setLoading(false);
        return;
      }
      // Cookie is set — full page reload to pick up server-side user context.
      window.location.href = nextPath && nextPath.startsWith('/') ? nextPath : '/dashboard';
    } catch {
      setError('Network error. Try again.');
      setLoading(false);
    }
  }

  return (
    <div className="min-h-screen bg-gradient-to-br from-indigo-50 via-white to-slate-100 flex items-center justify-center px-4">
      <div className="w-full max-w-md">
        {/* Logo / brand */}
        <div className="mb-8 flex flex-col items-center text-center">
          {/* eslint-disable-next-line @next/next/no-img-element */}
          <img src="/logo.png" alt="Vets Taxi" className="h-16 w-auto object-contain" onError={(e) => { (e.target as HTMLImageElement).style.display = 'none'; }} />
          <p className="mt-4 text-xl font-bold text-gray-900">Invoice System</p>
          <p className="mt-1 text-sm text-gray-500">17116039 Canada Inc</p>
        </div>

        <div className="rounded-2xl bg-white shadow-lg ring-1 ring-gray-200 p-8">
          <h1 className="text-xl font-semibold text-gray-900">
            {needsSetup ? 'Create the admin account' : 'Sign in'}
          </h1>
          <p className="mt-1 text-sm text-gray-500">
            {needsSetup
              ? 'No users yet. The first account you create is the administrator — you\u2019ll be able to add more users later.'
              : 'Enter your username and password to continue.'}
          </p>

          <form onSubmit={submit} className="mt-6 space-y-4">
            <Input
              label="Username"
              value={username}
              onChange={(e) => setUsername(e.target.value)}
              autoCapitalize="none"
              autoComplete="username"
              spellCheck={false}
              required
              placeholder="e.g. yash"
            />

            {needsSetup && (
              <Input
                label="Display name (optional)"
                value={displayName}
                onChange={(e) => setDisplayName(e.target.value)}
                placeholder="e.g. Yash"
              />
            )}

            <Input
              label="Password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              autoComplete={needsSetup ? 'new-password' : 'current-password'}
              required
              placeholder={needsSetup ? 'At least 8 characters' : ''}
            />

            {needsSetup && (
              <Input
                label="Confirm password"
                type="password"
                value={confirm}
                onChange={(e) => setConfirm(e.target.value)}
                autoComplete="new-password"
                required
              />
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">
                {error}
              </div>
            )}

            <Button type="submit" variant="primary" disabled={loading} className="w-full">
              {loading ? '\u2026' : needsSetup ? 'Create admin account' : 'Sign in'}
            </Button>
          </form>
        </div>

        <p className="mt-6 text-center text-xs text-gray-400">
          Protected system. All activity is logged.
        </p>
      </div>
    </div>
  );
}
