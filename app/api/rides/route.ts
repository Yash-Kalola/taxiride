import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  companyId:      z.string().min(1),
  month:          z.string().min(1),
  year:           z.coerce.number().int(),
  jobId:          z.string().default(''),
  vehicleNumber:  z.string().default(''),
  pickupLocation: z.string().default(''),
  dropoffLocation:z.string().default(''),
  passenger:      z.string().default(''),
  driver:         z.string().default(''),
  dateTime:       z.string().default(''),
  amount:         z.coerce.number().min(0),
});

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const where: Record<string, unknown> = {};
  if (sp.get('companyId')) where.companyId = sp.get('companyId');
  if (sp.get('month'))     where.month     = sp.get('month');
  if (sp.get('year'))      where.year      = parseInt(sp.get('year')!);

  try {
    const rides = await prisma.ride.findMany({
      where,
      include: { company: { select: { companyName: true, accountId: true } } },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(rides);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const ride = await prisma.ride.create({ data: parsed.data });
    return NextResponse.json(ride, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
