import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  customerName:    z.string().min(1, 'Customer name is required'),
  customerPhone:   z.string().default(''),
  customerEmail:   z.string().email().or(z.literal('')).default(''),
  eventDate:       z.string().min(1, 'Event date is required'),
  pickupTime:      z.string().default(''),
  pickupLocation:  z.string().default(''),
  dropoffLocation: z.string().default(''),
  passengers:      z.coerce.number().int().min(1).default(1),
  vehiclesNeeded:  z.coerce.number().int().min(1).default(1),
  quotedAmount:    z.coerce.number().min(0).default(0),
  status:          z.enum(['BOOKED', 'CONFIRMED', 'COMPLETED', 'CANCELLED']).default('BOOKED'),
  notes:           z.string().default(''),
  companyId:       z.string().nullable().default(null),
});

export async function GET() {
  try {
    const bookings = await prisma.partyBooking.findMany({
      include: { company: { select: { id: true, companyName: true } } },
      orderBy: { eventDate: 'desc' },
    });
    return NextResponse.json(bookings);
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
    const booking = await prisma.partyBooking.create({
      data: {
        ...parsed.data,
        eventDate: new Date(parsed.data.eventDate),
      },
      include: { company: { select: { id: true, companyName: true } } },
    });
    return NextResponse.json(booking, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
