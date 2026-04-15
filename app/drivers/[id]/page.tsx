import { notFound } from 'next/navigation';
import { prisma } from '@/lib/db';
import DriverDetailClient from '@/components/drivers/DriverDetailClient';

export const dynamic = 'force-dynamic';

export default async function DriverDetailPage({ params }: { params: { id: string } }) {
  const driverRaw = await prisma.driver.findUnique({
    where: { id: params.id },
    include: {
      assignments: { orderBy: { startDate: 'desc' } },
      dailySheets: { orderBy: { date: 'desc' } },
      payouts:     { orderBy: [{ year: 'desc' }, { month: 'desc' }, { payoutPeriod: 'desc' }] },
    },
  });
  if (!driverRaw) notFound();

  const driver = JSON.parse(JSON.stringify(driverRaw));

  return (
    <div className="px-8 py-8 space-y-6">
      <DriverDetailClient initialDriver={driver} />
    </div>
  );
}
