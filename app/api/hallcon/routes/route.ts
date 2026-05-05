import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  routeName:       z.string().min(1, 'Route name is required'),
  pickupLocation:  z.string().default(''),
  dropoffLocation: z.string().default(''),
  distanceKm:      z.coerce.number().min(0).default(0),
  driverPay:       z.coerce.number().min(0).default(0),
  billingAmount:   z.coerce.number().min(0).default(0),
  isActive:        z.boolean().default(true),
});

export async function GET() {
  try {
    const routes = await prisma.hallconRoute.findMany({
      include: { _count: { select: { trips: true } } },
      orderBy: { routeName: 'asc' },
    });
    return NextResponse.json(routes);
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
    const route = await prisma.hallconRoute.create({
      data: parsed.data,
      include: { _count: { select: { trips: true } } },
    });
    return NextResponse.json(route, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'A route with this name already exists' }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
