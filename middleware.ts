import { NextRequest, NextResponse } from 'next/server';
import { SESSION_COOKIE, verifySessionCookie } from '@/lib/auth-session';
import { resolvePageKey, PAGES } from '@/lib/pages';

// Paths that DON'T require auth. Everything else does.
const PUBLIC_PATHS = new Set<string>([
  '/login',
]);
const PUBLIC_PREFIXES = [
  '/api/auth/',   // login, logout, setup, me
  '/_next/',
  '/favicon',
];

function isPublic(pathname: string): boolean {
  if (PUBLIC_PATHS.has(pathname)) return true;
  return PUBLIC_PREFIXES.some((p) => pathname.startsWith(p));
}

/** API prefix → page key (so we block API calls the user's UI can't reach). */
function apiToPageKey(pathname: string): string | null {
  // Only match under /api/*. Everything public is filtered out before this.
  if (!pathname.startsWith('/api/')) return null;
  const rest = pathname.slice('/api/'.length).split('/')[0]; // first segment
  const map: Record<string, string> = {
    'invoices':         'invoices',
    'companies':        'companies',
    'brokers':          'brokers',
    'vehicles':         'vehicles',
    'drivers':          'drivers',
    'daily-sheets':     'daily-sheets',
    'payouts':          'payouts',
    'expenses':         'expenses',
    'company-expenses': 'company-expenses',
    'rides':            'rides',
    'import':           'import',
  };
  return map[rest] ?? null;
}

export async function middleware(req: NextRequest) {
  const { pathname } = req.nextUrl;

  // /api/users and /api/settings — admin-gated; handled below
  // /api/auth/* — always public (login endpoints)
  if (isPublic(pathname)) return NextResponse.next();

  const session = await verifySessionCookie(req.cookies.get(SESSION_COOKIE)?.value);

  // Not logged in → redirect to /login (for page nav) or 401 (for API)
  if (!session) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
    }
    const url = req.nextUrl.clone();
    url.pathname = '/login';
    url.searchParams.set('next', pathname);
    return NextResponse.redirect(url);
  }

  // Admin has full access.
  if (session.admin) return NextResponse.next();

  // /api/users, /api/settings/senders, /api/auth/setup: admin-only (already returned above for admin)
  if (
    pathname.startsWith('/api/users') ||
    pathname.startsWith('/api/settings/senders') ||
    pathname === '/api/auth/setup'
  ) {
    return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
  }
  if (pathname.startsWith('/settings/users') || pathname.startsWith('/settings/senders')) {
    const url = req.nextUrl.clone();
    url.pathname = '/dashboard';
    return NextResponse.redirect(url);
  }

  // Per-page permission check (non-admin).
  // Match page keys in two ways:
  //   (1) exact page path (e.g. /invoices)  → resolvePageKey
  //   (2) API under a namespace             → apiToPageKey
  const pageKey = resolvePageKey(pathname) ?? apiToPageKey(pathname);

  // If we don't know the page (e.g. some shared API like /api/vehicle-assignments,
  // or unknown dynamic routes), allow through. Better to not block unknown legit
  // traffic than to false-positive. Page-level guards handle the rest.
  if (!pageKey) return NextResponse.next();

  if (!session.pages.includes(pageKey)) {
    if (pathname.startsWith('/api/')) {
      return NextResponse.json({ error: 'Forbidden' }, { status: 403 });
    }
    // Redirect to first page they CAN access (fall back to /login).
    const firstAllowed = PAGES.find((p) => !p.adminOnly && session.pages.includes(p.key));
    const url = req.nextUrl.clone();
    url.pathname = firstAllowed?.path ?? '/login';
    url.searchParams.set('denied', pageKey);
    return NextResponse.redirect(url);
  }

  return NextResponse.next();
}

// Skip the middleware on static assets entirely. Everything else is evaluated.
export const config = {
  matcher: [
    '/((?!_next/static|_next/image|favicon.ico|logo\\.png|logo\\.jpg).*)',
  ],
};
