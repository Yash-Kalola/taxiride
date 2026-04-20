import { redirect } from 'next/navigation';
import { getCurrentSession, hasAnyUsers } from '@/lib/auth';
import LoginClient from '@/components/auth/LoginClient';

export const dynamic = 'force-dynamic';

export default async function LoginPage({ searchParams }: {
  searchParams: { next?: string };
}) {
  // Already logged in → straight to dashboard (or wherever they were headed)
  const sess = await getCurrentSession();
  if (sess) {
    redirect(searchParams.next && searchParams.next.startsWith('/') ? searchParams.next : '/dashboard');
  }

  const needsSetup = !(await hasAnyUsers());
  return <LoginClient needsSetup={needsSetup} nextPath={searchParams.next || '/dashboard'} />;
}
