import { prisma } from '@/lib/db';
import VehiclesClient from '@/components/vehicles/VehiclesClient';

export const dynamic = 'force-dynamic';

export default async function VehiclesPage() {
  let vehiclesRaw: any[] = [];
  let brokers: any[] = [];
  let drivers: any[] = [];
  let assignmentRows: any[] = [];

  try {
    const [vRaw, bRaw, dRaw, activeAssignments] = await Promise.all([
      prisma.brokerVehicle.findMany({
        orderBy: { cabNumber: 'asc' },
        include: { broker: { select: { id: true, name: true } }, accidents: { orderBy: { date: 'desc' } }, documents: { orderBy: { createdAt: 'desc' } } },
      }),
      prisma.broker.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.driver.findMany({
        where: { isActive: true },
        orderBy: { name: 'asc' },
        select: { id: true, name: true },
      }),
      prisma.vehicleAssignment.findMany({
        where: { isActive: true },
        include: { driver: { select: { id: true, name: true } } },
      }).catch(() => []),
    ]);
    vehiclesRaw = vRaw;
    brokers = bRaw;
    drivers = dRaw;

    // Build summary rows: morning/evening driver per cab
    const morningByCab = new Map<string, any>();
    const eveningByCab = new Map<string, any>();
    for (const a of activeAssignments) {
      (a.shift === 'MORNING' ? morningByCab : eveningByCab).set(a.vehicleNumber, a);
    }
    assignmentRows = vehiclesRaw.map((v) => ({
      cabNumber: v.cabNumber,
      morning: morningByCab.get(v.cabNumber)
        ? {
            assignmentId: morningByCab.get(v.cabNumber).id,
            driverId:     morningByCab.get(v.cabNumber).driverId,
            driverName:   morningByCab.get(v.cabNumber).driver.name,
          }
        : null,
      evening: eveningByCab.get(v.cabNumber)
        ? {
            assignmentId: eveningByCab.get(v.cabNumber).id,
            driverId:     eveningByCab.get(v.cabNumber).driverId,
            driverName:   eveningByCab.get(v.cabNumber).driver.name,
          }
        : null,
    }));
  } catch {}

  const vehicles = JSON.parse(JSON.stringify(vehiclesRaw));

  return (
    <div className="px-8 py-8 space-y-6">
      <VehiclesClient
        initialVehicles={vehicles}
        brokers={brokers}
        drivers={drivers}
        initialAssignments={assignmentRows}
      />
    </div>
  );
}
