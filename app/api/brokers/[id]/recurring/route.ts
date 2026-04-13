import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  type:        z.enum(['STAND_RENT', 'COMPANY_PAYMENT', 'PRODUCT_CHARGE', 'INSURANCE', 'PAYOUT', 'OTHER']),
  amount:      z.number().min(0),
  description: z.string().default(''),
  dayOfMonth:  z.number().int().min(1).max(31),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const charges = await prisma.recurringCharge.findMany({
      where: { brokerId: params.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(charges);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const charge = await prisma.recurringCharge.create({
      data: { brokerId: params.id, ...parsed.data },
    });
    return NextResponse.json(charge, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
