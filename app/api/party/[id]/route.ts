import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  customerName:    z.string().min(1).optional(),
  customerPhone:   z.string().optional(),
  customerEmail:   z.string().email().or(z.literal('')).optional(),
  eventDate:       z.string().optional(),
  pickupTime:      z.string().optional(),
  pickupLocation:  z.string().optional(),
  dropoffLocation: z.string().optional(),
  passengers:      z.coerce.number().int().min(1).optional(),
  vehiclesNeeded:  z.coerce.number().int().min(1).optional(),
  quotedAmount:    z.coerce.number().min(0).optional(),
  status:          z.enum(['BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).optional(),
  notes:           z.string().optional(),
  companyId:       z.string().nullable().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const booking = await prisma.partyBooking.findUnique({
      where: { id: params.id },
      include: { company: { select: { id: true, companyName: true } } },
    });
    if (!booking) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(booking);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const data: any = { ...parsed.data };
    if (data.eventDate) data.eventDate = new Date(data.eventDate);
    const booking = await prisma.partyBooking.update({
      where: { id: params.id },
      data,
      include: { company: { select: { id: true, companyName: true } } },
    });
    return NextResponse.json(booking);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.partyBooking.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
