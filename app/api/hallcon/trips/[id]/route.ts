import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  routeId:       z.string().optional(),
  date:          z.string().optional(),
  driver:        z.string().optional(),
  vehicleNumber: z.string().optional(),
  passengers:    z.coerce.number().int().min(1).optional(),
  driverPay:     z.coerce.number().min(0).optional(),
  billingAmount: z.coerce.number().min(0).optional(),
  notes:         z.string().optional(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const data: any = { ...parsed.data };
    if (data.date) {
      const d = new Date(data.date);
      data.date  = d;
      data.month = d.getMonth() + 1;
      data.year  = d.getFullYear();
    }
    const trip = await prisma.hallconTrip.update({
      where: { id: params.id },
      data,
      include: { route: { select: { id: true, routeName: true, pickupLocation: true, dropoffLocation: true } } },
    });
    return NextResponse.json(trip);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.hallconTrip.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
