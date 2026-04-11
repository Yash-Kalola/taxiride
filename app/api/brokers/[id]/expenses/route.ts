import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  cabNumber: z.string().default(''),
  date:      z.string().min(1),
  amount:    z.number(),
  note:      z.string().default(''),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const expenses = await prisma.brokerExpense.findMany({
      where: { brokerId: params.id },
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(expenses);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const broker = await prisma.broker.findUnique({ where: { id: params.id } });
    if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 });
    const expense = await prisma.brokerExpense.create({
      data: { ...parsed.data, brokerId: params.id, date: new Date(parsed.data.date) },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
