import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/brokers/[id]/rides
 * Returns rides whose vehicleNumber matches any of this broker's vehicle cabNumbers.
 * Optional query params: month, year
 */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const vehicles = await prisma.brokerVehicle.findMany({
      where: { brokerId: params.id },
      select: { cabNumber: true },
    });
    if (vehicles.length === 0) return NextResponse.json([]);

    const cabNumbers = vehicles.map((v) => v.cabNumber);

    const url = new URL(_.url);
    const month = url.searchParams.get('month');
    const year  = url.searchParams.get('year');

    const where: any = { vehicleNumber: { in: cabNumbers }, voided: false };
    if (month) where.month = month;
    if (year)  where.year = parseInt(year);

    const rides = await prisma.ride.findMany({
      where,
      orderBy: { dateTime: 'desc' },
      include: { company: { select: { companyName: true } } },
    });

    return NextResponse.json(rides);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
