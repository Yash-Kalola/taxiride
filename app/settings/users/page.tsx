import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import { ASSIGNABLE_PAGES } from '@/lib/pages';
import UsersClient from '@/components/settings/UsersClient';

export const dynamic = 'force-dynamic';

export default async function UsersSettingsPage() {
  const sess = await getCurrentSession();
  if (!sess?.admin) redirect('/dashboard');

  const users = await prisma.user.findMany({
    orderBy: [{ isAdmin: 'desc' }, { username: 'asc' }],
    select: {
      id: true, username: true, displayName: true,
      isAdmin: true, allowedPages: true,
      createdAt: true, updatedAt: true,
    },
  });

  return (
    <div className="px-8 py-8 space-y-6">
      <UsersClient
        initialUsers={JSON.parse(JSON.stringify(users))}
        assignablePages={ASSIGNABLE_PAGES}
        currentUserId={sess.uid}
      />
    </div>
  );
}
