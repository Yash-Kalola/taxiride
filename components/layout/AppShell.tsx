'use client';
import { usePathname } from 'next/navigation';
import Sidebar from './Sidebar';

/**
 * Hides the sidebar on /login so the login screen gets the full viewport.
 * Everything else renders with the standard sidebar + padded content area.
 */
export default function AppShell({ children, currentUser }: {
  children: React.ReactNode;
  currentUser: { username: string; displayName: string; isAdmin: boolean; pages: string[] } | null;
}) {
  const pathname = usePathname();
  const isAuthScreen = pathname === '/login';

  if (isAuthScreen || !currentUser) {
    return <>{children}</>;
  }

  return (
    <>
      <Sidebar currentUser={currentUser} />
      <div className="pl-60 min-h-screen">{children}</div>
    </>
  );
}
