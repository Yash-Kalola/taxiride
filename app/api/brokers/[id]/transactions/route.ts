import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  type:        z.enum(['STAND_RENT', 'COMPANY_PAYMENT', 'PRODUCT_CHARGE', 'INSURANCE', 'PAYOUT', 'OTHER']),
  amount:      z.coerce.number(),
  description: z.string().default(''),
  dueDate:     z.string().nullable().optional(),
  month:       z.coerce.number().int().min(1).max(12),
  year:        z.coerce.number().int(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const transactions = await prisma.brokerTransaction.findMany({
      where:   { brokerId: params.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(transactions);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const broker = await prisma.broker.findUnique({ where: { id: params.id } });
    if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 });

    const tx = await prisma.brokerTransaction.create({
      data: {
        brokerId:    params.id,
        type:        parsed.data.type,
        amount:      parsed.data.amount,
        description: parsed.data.description,
        dueDate:     parsed.data.dueDate ? new Date(parsed.data.dueDate) : null,
        month:       parsed.data.month,
        year:        parsed.data.year,
        status:      'PENDING',
      },
    });
    return NextResponse.json(tx, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
