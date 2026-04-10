import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const rowSchema = z.object({
  jobId:           z.string().default(''),
  vehicleNumber:   z.string().default(''),
  pickupLocation:  z.string().default(''),
  dropoffLocation: z.string().default(''),
  passenger:       z.string().default(''),
  driver:          z.string().default(''),
  dateTime:        z.string().default(''),
  amount:          z.coerce.number().min(0),
});

const bodySchema = z.object({
  companyId: z.string().min(1),
  month:     z.string().min(1),
  year:      z.coerce.number().int(),
  rows:      z.array(rowSchema).min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { companyId, month, year, rows } = parsed.data;

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const result = await prisma.ride.createMany({
      data: rows.map((row) => ({ ...row, companyId, month, year })),
    });

    return NextResponse.json({ imported: result.count }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
