import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { MONTHS } from '@/lib/constants';

/**
 * GET /api/brokers/[id]/rides
 * Returns rides whose vehicleNumber matches any of this broker's vehicle cabNumbers.
 * Optional query params: month (1-12 number), year
 */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const vehicles = await prisma.brokerVehicle.findMany({
      where: { brokerId: params.id },
      select: { cabNumber: true },
    });
    if (vehicles.length === 0) return NextResponse.json([]);

    const cabNumbers = vehicles.map((v) => v.cabNumber.trim());

    const url = new URL(_.url);
    const monthParam = url.searchParams.get('month');
    const year       = url.searchParams.get('year');

    const where: any = { vehicleNumber: { in: cabNumbers }, voided: false };

    // Ride.month stores full month names ("January", "April", etc.)
    // Query param comes as a number (1-12), so convert to month name
    if (monthParam) {
      const monthNum = parseInt(monthParam);
      if (monthNum >= 1 && monthNum <= 12) {
        where.month = MONTHS[monthNum - 1]; // e.g., 4 → "April"
      }
    }
    if (year) where.year = parseInt(year);

    const rides = await prisma.ride.findMany({
      where,
      orderBy: { dateTime: 'desc' },
      select: {
        id: true, vehicleNumber: true, dateTime: true, amount: true,
        passenger: true, pickupLocation: true, dropoffLocation: true,
      },
    });

    return NextResponse.json(rides);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
