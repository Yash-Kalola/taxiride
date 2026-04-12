import { prisma } from '@/lib/db';
import VehiclesClient from '@/components/vehicles/VehiclesClient';

export const dynamic = 'force-dynamic';

export default async function VehiclesPage() {
  let vehiclesRaw: any[] = [];
  let brokers: any[] = [];
  try {
    [vehiclesRaw, brokers] = await Promise.all([
      prisma.brokerVehicle.findMany({
        orderBy: { cabNumber: 'asc' },
        include: { broker: { select: { id: true, name: true } }, accidents: { orderBy: { date: 'desc' } }, documents: { orderBy: { createdAt: 'desc' } } },
      }),
      prisma.broker.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
    ]);
  } catch {}

  const vehicles = JSON.parse(JSON.stringify(vehiclesRaw));

  return (
    <div className="px-8 py-8 space-y-6">
      <VehiclesClient initialVehicles={vehicles} brokers={brokers} />
    </div>
  );
}
