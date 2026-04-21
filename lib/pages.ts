// The complete set of pages an admin can grant access to.
// The `key` is what gets stored in User.allowedPages and what middleware
// matches against the request path. Keep in sync with the sidebar nav.

export interface PageDef {
  key:   string;        // what gets stored + matched in middleware
  path:  string;        // canonical URL path
  label: string;        // human name shown to admin
  adminOnly?: boolean;  // admin-only pages (Users management, etc.)
}

export const PAGES: PageDef[] = [
  { key: 'dashboard',        path: '/dashboard',        label: 'Dashboard' },
  { key: 'invoices',         path: '/invoices',         label: 'Invoices' },
  { key: 'companies',        path: '/companies',        label: 'Companies' },
  { key: 'brokers',          path: '/brokers',          label: 'Brokers' },
  { key: 'vehicles',         path: '/vehicles',         label: 'Vehicles' },
  { key: 'drivers',          path: '/drivers',          label: 'Drivers' },
  { key: 'daily-sheets',     path: '/daily-sheets',     label: 'Daily Sheets' },
  { key: 'payouts',          path: '/payouts',          label: 'Payouts' },
  { key: 'expenses',         path: '/expenses',         label: 'Broker Expenses' },
  { key: 'company-expenses', path: '/company-expenses', label: 'Company Expenses' },
  { key: 'rides',            path: '/rides',            label: 'Rides' },
  { key: 'overview',         path: '/overview',         label: 'Overview' },
  { key: 'import',           path: '/import',           label: 'Import' },
  { key: 'settings-email',   path: '/settings/email',   label: 'Email Template' },
  { key: 'settings-senders', path: '/settings/senders', label: 'Email Senders',    adminOnly: true },
  { key: 'settings-users',   path: '/settings/users',   label: 'Users',            adminOnly: true },
];

// Granular pages a non-admin could reasonably be given. Excludes admin-only.
export const ASSIGNABLE_PAGES = PAGES.filter((p) => !p.adminOnly);

/** Match a request path to a page key. Longest prefix wins. */
export function resolvePageKey(pathname: string): string | null {
  const hit = [...PAGES]
    .sort((a, b) => b.path.length - a.path.length)
    .find((p) => pathname === p.path || pathname.startsWith(p.path + '/'));
  return hit?.key ?? null;
}
