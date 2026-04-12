import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  brokerId:  z.string().min(1),
  cabNumber: z.string().default(''),
  date:      z.string().min(1),
  amount:    z.coerce.number(),
  note:      z.string().default(''),
});

export async function GET() {
  try {
    const expenses = await prisma.brokerExpense.findMany({
      orderBy: { date: 'desc' },
      include: { broker: { select: { id: true, name: true } } },
    });
    return NextResponse.json(expenses);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const expense = await prisma.brokerExpense.create({
      data: {
        brokerId:  parsed.data.brokerId,
        cabNumber: parsed.data.cabNumber,
        date:      new Date(parsed.data.date),
        amount:    parsed.data.amount,
        note:      parsed.data.note,
      },
      include: { broker: { select: { id: true, name: true } } },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
