import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  date:            z.string().min(1),
  incidentNumber:  z.string().min(1),
  claimNumber:     z.string().default(''),
  driver:          z.string().default(''),
  settlementAmount: z.coerce.number().optional(),
  notes:           z.string().default(''),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const accidents = await prisma.vehicleAccident.findMany({
      where:   { vehicleId: params.id },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(accidents);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const accident = await prisma.vehicleAccident.create({
      data: {
        vehicleId:       params.id,
        date:            new Date(parsed.data.date),
        incidentNumber:  parsed.data.incidentNumber,
        claimNumber:     parsed.data.claimNumber,
        driver:          parsed.data.driver,
        settlementAmount: parsed.data.settlementAmount ?? null,
        notes:           parsed.data.notes,
      },
    });
    return NextResponse.json(accident, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
