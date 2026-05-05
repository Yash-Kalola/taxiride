import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  routeId:       z.string().min(1, 'Route is required'),
  date:          z.string().min(1, 'Date is required'),
  driver:        z.string().default(''),
  vehicleNumber: z.string().default(''),
  passengers:    z.coerce.number().int().min(1).default(1),
  driverPay:     z.coerce.number().min(0).default(0),
  billingAmount: z.coerce.number().min(0).default(0),
  notes:         z.string().default(''),
});

export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const month = searchParams.get('month') ? parseInt(searchParams.get('month')!) : undefined;
  const year  = searchParams.get('year')  ? parseInt(searchParams.get('year')!)  : undefined;

  try {
    const where: any = {};
    if (month) where.month = month;
    if (year)  where.year  = year;

    const trips = await prisma.hallconTrip.findMany({
      where,
      include: { route: { select: { id: true, routeName: true, pickupLocation: true, dropoffLocation: true } } },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(trips);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const tripDate = new Date(parsed.data.date);
    const trip = await prisma.hallconTrip.create({
      data: {
        ...parsed.data,
        date:  tripDate,
        month: tripDate.getMonth() + 1,
        year:  tripDate.getFullYear(),
      },
      include: { route: { select: { id: true, routeName: true, pickupLocation: true, dropoffLocation: true } } },
    });
    return NextResponse.json(trip, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
