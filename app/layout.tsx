import type { Metadata } from 'next';
import AppShell from '@/components/layout/AppShell';
import { getCurrentSession } from '@/lib/auth';
import './globals.css';

export const metadata: Metadata = {
  title: 'TaxiRide — Invoice System',
  description: 'Charge Call & Invoice System for 17116039 Canada Inc',
};

export default async function RootLayout({ children }: { children: React.ReactNode }) {
  const sess = await getCurrentSession();
  const currentUser = sess
    ? { username: sess.un, displayName: sess.un, isAdmin: sess.admin, pages: sess.pages }
    : null;

  return (
    <html lang="en">
      <body className="bg-gray-50 text-gray-900 antialiased">
        <AppShell currentUser={currentUser}>{children}</AppShell>
      </body>
    </html>
  );
}
