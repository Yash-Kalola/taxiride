import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  vehicleNumber: z.string().min(1),
  shift:         z.enum(['MORNING', 'EVENING']),
  startDate:     z.string().min(1),
});

/**
 * Assign a driver to a vehicle+shift. Business rules:
 *   • Driver can only be on ONE vehicle+shift at a time — end current assignment
 *   • A vehicle+shift can only have ONE active driver — end whoever was there
 */
export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { vehicleNumber, shift, startDate } = parsed.data;
  const start = new Date(startDate);

  try {
    // Verify driver exists + is active
    const driver = await prisma.driver.findUnique({ where: { id: params.id } });
    if (!driver)          return NextResponse.json({ error: 'Driver not found' }, { status: 404 });
    if (!driver.isActive) return NextResponse.json({ error: 'Cannot assign vehicle to an inactive driver' }, { status: 400 });

    const endDate = new Date(start.getTime() - 1); // end prior assignments just before the new one starts

    const assignment = await prisma.$transaction(async (tx) => {
      // 1. End any active assignments for THIS driver (any vehicle)
      await tx.vehicleAssignment.updateMany({
        where: { driverId: params.id, isActive: true },
        data:  { isActive: false, endDate },
      });
      // 2. End any active assignment for THIS vehicle+shift (by any other driver)
      await tx.vehicleAssignment.updateMany({
        where: { vehicleNumber, shift, isActive: true },
        data:  { isActive: false, endDate },
      });
      // 3. Create the new assignment
      return tx.vehicleAssignment.create({
        data: {
          driverId: params.id,
          vehicleNumber,
          shift,
          startDate: start,
          isActive: true,
        },
      });
    });

    return NextResponse.json(assignment, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const assignments = await prisma.vehicleAssignment.findMany({
      where: { driverId: params.id },
      orderBy: { startDate: 'desc' },
    });
    return NextResponse.json(assignments);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
