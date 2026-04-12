import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  cabNumber:       z.string().min(1),
  brokerId:        z.string().nullable().optional(),
  isCompanyCar:    z.boolean().default(false),
  insuranceAmount: z.number().default(0),
});

export async function GET() {
  try {
    const vehicles = await prisma.brokerVehicle.findMany({
      orderBy: { cabNumber: 'asc' },
      include: { broker: { select: { id: true, name: true } } },
    });
    return NextResponse.json(vehicles);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const vehicle = await prisma.brokerVehicle.create({
      data: parsed.data,
      include: {
        broker:    { select: { id: true, name: true } },
        accidents: { orderBy: { date: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });
    return NextResponse.json(vehicle, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
