'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Input from '@/components/ui/Input';
import PageHeader from '@/components/ui/PageHeader';
import Badge from '@/components/ui/Badge';

interface User {
  id:           string;
  username:     string;
  displayName:  string;
  isAdmin:      boolean;
  allowedPages: string[];
  createdAt:    string;
  updatedAt:    string;
}
interface PageDef { key: string; path: string; label: string; }

export default function UsersClient({
  initialUsers, assignablePages, currentUserId,
}: {
  initialUsers:    User[];
  assignablePages: PageDef[];
  currentUserId:   string;
}) {
  const [users,   setUsers]   = useState<User[]>(initialUsers);
  const [editing, setEditing] = useState<User | null>(null);
  const [creating, setCreating] = useState(false);

  async function refresh() {
    const res = await fetch('/api/users');
    if (res.ok) setUsers(await res.json());
  }

  async function deleteUser(u: User) {
    if (u.id === currentUserId) { alert('You cannot delete yourself.'); return; }
    if (!confirm(`Delete user "${u.username}"? This cannot be undone.`)) return;
    const res = await fetch(`/api/users/${u.id}`, { method: 'DELETE' });
    if (!res.ok) {
      const data = await res.json().catch(() => null);
      alert(data?.error || 'Failed to delete.');
      return;
    }
    await refresh();
  }

  return (
    <>
      <PageHeader
        title="Users"
        description="Create accounts and control which pages each person can access."
        action={<Button variant="primary" onClick={() => setCreating(true)}>Add User</Button>}
      />

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        <table className="w-full text-sm">
          <thead>
            <tr className="border-b border-gray-100 bg-gray-50">
              {['Username', 'Display Name', 'Role', 'Access', 'Created', ''].map((h) => (
                <th key={h} className="px-5 py-3 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 whitespace-nowrap">{h}</th>
              ))}
            </tr>
          </thead>
          <tbody className="divide-y divide-gray-50">
            {users.map((u) => (
              <tr key={u.id} className="hover:bg-gray-50">
                <td className="px-5 py-3.5 font-mono text-sm font-medium text-gray-900">
                  {u.username}
                  {u.id === currentUserId && <span className="ml-2 text-xs text-gray-400">(you)</span>}
                </td>
                <td className="px-5 py-3.5 text-gray-700">{u.displayName || '—'}</td>
                <td className="px-5 py-3.5">
                  {u.isAdmin
                    ? <span className="inline-flex items-center rounded-full bg-indigo-50 px-2.5 py-0.5 text-xs font-medium text-indigo-700">Admin</span>
                    : <span className="inline-flex items-center rounded-full bg-slate-100 px-2.5 py-0.5 text-xs font-medium text-slate-600">User</span>}
                </td>
                <td className="px-5 py-3.5 text-gray-600 text-xs">
                  {u.isAdmin
                    ? <span className="text-indigo-600">All pages</span>
                    : u.allowedPages.length === 0
                      ? <span className="text-red-500">No access</span>
                      : `${u.allowedPages.length} page${u.allowedPages.length !== 1 ? 's' : ''}`}
                </td>
                <td className="px-5 py-3.5 text-xs text-gray-500">{new Date(u.createdAt).toLocaleDateString()}</td>
                <td className="px-5 py-3.5">
                  <div className="flex items-center gap-1">
                    <Button size="sm" variant="ghost" onClick={() => setEditing(u)}>Edit</Button>
                    <Button
                      size="sm"
                      variant="ghost"
                      onClick={() => deleteUser(u)}
                      className="text-red-500 hover:bg-red-50"
                      disabled={u.id === currentUserId}
                    >
                      Delete
                    </Button>
                  </div>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      </div>

      {creating && (
        <UserFormModal
          mode="create"
          assignablePages={assignablePages}
          onClose={() => setCreating(false)}
          onSaved={async () => { setCreating(false); await refresh(); }}
        />
      )}
      {editing && (
        <UserFormModal
          mode="edit"
          user={editing}
          assignablePages={assignablePages}
          onClose={() => setEditing(null)}
          onSaved={async () => { setEditing(null); await refresh(); }}
        />
      )}
    </>
  );
}

function UserFormModal({
  mode, user, assignablePages, onClose, onSaved,
}: {
  mode:            'create' | 'edit';
  user?:           User;
  assignablePages: PageDef[];
  onClose:         () => void;
  onSaved:         () => void;
}) {
  const [username,    setUsername]    = useState(user?.username ?? '');
  const [displayName, setDisplayName] = useState(user?.displayName ?? '');
  const [password,    setPassword]    = useState('');
  const [isAdmin,     setIsAdmin]     = useState(user?.isAdmin ?? false);
  const [pages,       setPages]       = useState<Set<string>>(new Set(user?.allowedPages ?? []));
  const [error,       setError]       = useState<string | null>(null);
  const [saving,      setSaving]      = useState(false);

  function toggle(key: string) {
    setPages((prev) => {
      const next = new Set(prev);
      if (next.has(key)) next.delete(key); else next.add(key);
      return next;
    });
  }
  function selectAll() { setPages(new Set(assignablePages.map((p) => p.key))); }
  function selectNone() { setPages(new Set()); }

  async function submit(e: React.FormEvent) {
    e.preventDefault();
    setError(null);

    if (mode === 'create' && password.length < 8) {
      setError('Password must be at least 8 characters');
      return;
    }
    if (mode === 'edit' && password.length > 0 && password.length < 8) {
      setError('New password must be at least 8 characters');
      return;
    }

    setSaving(true);
    try {
      const allowed = Array.from(pages);
      if (mode === 'create') {
        const res = await fetch('/api/users', {
          method:  'POST',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify({ username, displayName, password, isAdmin, allowedPages: allowed }),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(typeof data?.error === 'string' ? data.error : 'Could not create user.');
          setSaving(false);
          return;
        }
      } else {
        const body: any = { displayName, isAdmin, allowedPages: allowed };
        if (password) body.password = password;
        const res = await fetch(`/api/users/${user!.id}`, {
          method:  'PATCH',
          headers: { 'Content-Type': 'application/json' },
          body:    JSON.stringify(body),
        });
        if (!res.ok) {
          const data = await res.json().catch(() => null);
          setError(typeof data?.error === 'string' ? data.error : 'Could not save changes.');
          setSaving(false);
          return;
        }
      }
      onSaved();
    } catch {
      setError('Network error. Try again.');
      setSaving(false);
    }
  }

  return (
    <div className="fixed inset-0 z-50 flex items-start justify-center bg-black/40 px-4 py-10 overflow-y-auto">
      <div className="w-full max-w-lg rounded-2xl bg-white shadow-xl">
        <form onSubmit={submit}>
          <div className="px-6 py-5 border-b border-gray-100">
            <h2 className="text-lg font-semibold text-gray-900">
              {mode === 'create' ? 'Add user' : `Edit ${user?.username}`}
            </h2>
            <p className="mt-0.5 text-sm text-gray-500">
              {mode === 'create'
                ? 'They\u2019ll sign in with this username and password.'
                : 'Leave password blank to keep it unchanged.'}
            </p>
          </div>

          <div className="px-6 py-5 space-y-4">
            {mode === 'create' && (
              <Input
                label="Username"
                value={username}
                onChange={(e) => setUsername(e.target.value.toLowerCase())}
                placeholder="e.g. sara"
                hint="Lowercase letters, numbers, . _ - only."
                autoCapitalize="none"
                spellCheck={false}
                required
              />
            )}
            <Input
              label="Display name"
              value={displayName}
              onChange={(e) => setDisplayName(e.target.value)}
              placeholder="e.g. Sara Khan"
            />
            <Input
              label={mode === 'create' ? 'Password' : 'New password (optional)'}
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              placeholder={mode === 'create' ? 'At least 8 characters' : 'Leave blank to keep current'}
              autoComplete="new-password"
              required={mode === 'create'}
            />

            <label className="flex items-center gap-2 text-sm text-gray-700 select-none">
              <input
                type="checkbox"
                checked={isAdmin}
                onChange={(e) => setIsAdmin(e.target.checked)}
                className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
              />
              <span>Administrator — full access to everything (including Users)</span>
            </label>

            {!isAdmin && (
              <div className="rounded-xl border border-gray-200 p-4">
                <div className="flex items-center justify-between mb-3">
                  <p className="text-sm font-semibold text-gray-900">Pages this user can access</p>
                  <div className="flex gap-1 text-xs">
                    <button type="button" onClick={selectAll} className="text-indigo-600 hover:underline">All</button>
                    <span className="text-gray-300">·</span>
                    <button type="button" onClick={selectNone} className="text-gray-500 hover:underline">None</button>
                  </div>
                </div>
                <div className="grid grid-cols-2 gap-1.5">
                  {assignablePages.map((p) => (
                    <label key={p.key} className="flex items-center gap-2 rounded-lg px-2.5 py-1.5 text-sm text-gray-700 hover:bg-gray-50 select-none cursor-pointer">
                      <input
                        type="checkbox"
                        checked={pages.has(p.key)}
                        onChange={() => toggle(p.key)}
                        className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                      />
                      {p.label}
                    </label>
                  ))}
                </div>
              </div>
            )}

            {error && (
              <div className="rounded-lg border border-red-200 bg-red-50 px-3 py-2 text-sm text-red-700">{error}</div>
            )}
          </div>

          <div className="flex items-center justify-end gap-2 px-6 py-4 border-t border-gray-100 bg-gray-50 rounded-b-2xl">
            <Button type="button" variant="ghost" onClick={onClose} disabled={saving}>Cancel</Button>
            <Button type="submit" variant="primary" disabled={saving}>
              {saving ? '\u2026' : mode === 'create' ? 'Create user' : 'Save changes'}
            </Button>
          </div>
        </form>
      </div>
    </div>
  );
}
