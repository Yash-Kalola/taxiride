import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/vehicle-assignments/summary
 * Returns one row per known cab number with current morning & evening driver (if any).
 * Cab numbers come from BrokerVehicle (master list) plus any daily-sheet vehicles not yet in BrokerVehicle.
 */
export async function GET() {
  try {
    const [vehicles, activeAssignments, sheetVehicles] = await Promise.all([
      prisma.brokerVehicle.findMany({
        orderBy: { cabNumber: 'asc' },
        select: { id: true, cabNumber: true, isActive: true, isCompanyCar: true },
      }),
      prisma.vehicleAssignment.findMany({
        where: { isActive: true },
        include: { driver: { select: { id: true, name: true, phone: true } } },
      }),
      prisma.dailySheet.findMany({ distinct: ['vehicleNumber'], select: { vehicleNumber: true } }),
    ]);

    // Build a comprehensive cab number set
    const cabSet = new Set<string>(vehicles.map((v) => v.cabNumber));
    for (const s of sheetVehicles) if (s.vehicleNumber) cabSet.add(s.vehicleNumber);
    for (const a of activeAssignments) cabSet.add(a.vehicleNumber);

    const metaByCab = new Map(vehicles.map((v) => [v.cabNumber, v]));
    const morningByCab = new Map<string, typeof activeAssignments[number]>();
    const eveningByCab = new Map<string, typeof activeAssignments[number]>();
    for (const a of activeAssignments) {
      (a.shift === 'MORNING' ? morningByCab : eveningByCab).set(a.vehicleNumber, a);
    }

    // Natural sort by numeric prefix, then string
    const cabs = Array.from(cabSet).sort((a, b) => {
      const na = parseInt(a); const nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });

    const rows = cabs.map((cabNumber) => {
      const meta = metaByCab.get(cabNumber);
      const m = morningByCab.get(cabNumber);
      const e = eveningByCab.get(cabNumber);
      return {
        cabNumber,
        isKnownVehicle: !!meta,
        isActive:       meta?.isActive ?? true,
        isCompanyCar:   meta?.isCompanyCar ?? false,
        morning: m ? { assignmentId: m.id, driverId: m.driverId, driverName: m.driver.name, driverPhone: m.driver.phone, startDate: m.startDate } : null,
        evening: e ? { assignmentId: e.id, driverId: e.driverId, driverName: e.driver.name, driverPhone: e.driver.phone, startDate: e.startDate } : null,
      };
    });

    return NextResponse.json({ rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
