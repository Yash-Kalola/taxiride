import { prisma } from '@/lib/db';
import BrokersClient from '@/components/brokers/BrokersClient';

export const dynamic = 'force-dynamic';

export default async function BrokersPage() {
  let brokersRaw: any[] = [];
  try {
    brokersRaw = await prisma.broker.findMany({
      orderBy: { name: 'asc' },
      include: { transactions: true, vehicles: { where: { isActive: true } } },
    });
  } catch {}

  // Serialize Dates to strings for client components
  const brokers = JSON.parse(JSON.stringify(brokersRaw));

  return (
    <div className="px-8 py-8 space-y-6">
      <BrokersClient initialBrokers={brokers} />
    </div>
  );
}
