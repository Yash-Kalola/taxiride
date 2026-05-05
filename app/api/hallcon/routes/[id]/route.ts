import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  routeName:       z.string().min(1).optional(),
  pickupLocation:  z.string().optional(),
  dropoffLocation: z.string().optional(),
  distanceKm:      z.coerce.number().min(0).optional(),
  driverPay:       z.coerce.number().min(0).optional(),
  billingAmount:   z.coerce.number().min(0).optional(),
  isActive:        z.boolean().optional(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const route = await prisma.hallconRoute.update({
      where: { id: params.id },
      data: parsed.data,
      include: { _count: { select: { trips: true } } },
    });
    return NextResponse.json(route);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (err?.code === 'P2002') return NextResponse.json({ error: 'A route with this name already exists' }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.hallconRoute.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
