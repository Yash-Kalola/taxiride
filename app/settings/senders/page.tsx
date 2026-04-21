import { redirect } from 'next/navigation';
import { prisma } from '@/lib/db';
import { getCurrentSession } from '@/lib/auth';
import SendersClient from '@/components/settings/SendersClient';

export const dynamic = 'force-dynamic';

export default async function EmailSendersPage() {
  const sess = await getCurrentSession();
  if (!sess?.admin) redirect('/dashboard');

  const senders = await prisma.emailSender.findMany({
    orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
  });

  return (
    <div className="px-8 py-8 space-y-6">
      <SendersClient initial={JSON.parse(JSON.stringify(senders))} />
    </div>
  );
}
