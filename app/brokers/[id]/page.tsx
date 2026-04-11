import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import BrokerDetailClient from '@/components/brokers/BrokerDetailClient';

export const dynamic = 'force-dynamic';

export default async function BrokerDetailPage({ params }: { params: { id: string } }) {
  let brokerRaw: any = null;
  try {
    brokerRaw = await prisma.broker.findUnique({
      where: { id: params.id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
        vehicles: { orderBy: { cabNumber: 'asc' } },
        expenses: { orderBy: { date: 'desc' } },
      },
    });
  } catch {}

  if (!brokerRaw) notFound();

  // Serialize Dates to strings for client component
  const broker = JSON.parse(JSON.stringify(brokerRaw));

  return (
    <div className="px-8 py-8 space-y-6">
      <BrokerDetailClient broker={broker} />
    </div>
  );
}
