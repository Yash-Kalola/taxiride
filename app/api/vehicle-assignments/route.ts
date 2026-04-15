import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

/**
 * POST /api/vehicle-assignments
 * Reassign a driver to a vehicle+shift. Same logic as /api/drivers/[id]/assignments
 * but keyed by (vehicleNumber, shift) from the Vehicles page UI.
 *
 * Body: { vehicleNumber, shift, driverId | null, startDate? }
 * If driverId is null, the vehicle+shift is set to unassigned (active assignment ended).
 */

const schema = z.object({
  vehicleNumber: z.string().min(1),
  shift:         z.enum(['MORNING', 'EVENING']),
  driverId:      z.string().nullable(),
  startDate:     z.string().optional(),  // defaults to today
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { vehicleNumber, shift, driverId, startDate } = parsed.data;
  let start: Date;
  if (startDate) {
    const d = parseLocalDate(startDate);
    if (!d) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
    start = d;
  } else {
    start = new Date();
  }
  const endDate = new Date(start.getTime() - 1);

  try {
    const result = await prisma.$transaction(async (tx) => {
      // Always end the current active assignment for this vehicle+shift
      await tx.vehicleAssignment.updateMany({
        where: { vehicleNumber, shift, isActive: true },
        data:  { isActive: false, endDate },
      });

      // If unassigning, stop here
      if (!driverId) return null;

      // Also end any active assignment for this driver (one vehicle at a time)
      const driver = await tx.driver.findUnique({ where: { id: driverId } });
      if (!driver)          throw new Error('Driver not found');
      if (!driver.isActive) throw new Error('Cannot assign vehicle to inactive driver');

      await tx.vehicleAssignment.updateMany({
        where: { driverId, isActive: true },
        data:  { isActive: false, endDate },
      });

      return tx.vehicleAssignment.create({
        data: { driverId, vehicleNumber, shift, startDate: start, isActive: true },
      });
    });

    return NextResponse.json(result ?? { unassigned: true }, { status: 201 });
  } catch (err: any) {
    const msg: string = typeof err?.message === 'string' ? err.message : '';
    // Known business-rule errors thrown from the txn — safe to surface.
    if (msg.startsWith('Driver not found') || msg.startsWith('Cannot assign')) {
      return NextResponse.json({ error: msg }, { status: 400 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

/** GET /api/vehicle-assignments?vehicleNumber=30 — history for a cab */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const vehicleNumber = url.searchParams.get('vehicleNumber');

  try {
    const where = vehicleNumber ? { vehicleNumber } : {};
    const history = await prisma.vehicleAssignment.findMany({
      where,
      orderBy: [{ vehicleNumber: 'asc' }, { startDate: 'desc' }],
      include: { driver: { select: { id: true, name: true, isActive: true } } },
    });
    return NextResponse.json(history);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
