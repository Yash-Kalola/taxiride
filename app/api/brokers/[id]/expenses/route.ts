import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

const createSchema = z.object({
  cabNumber: z.string().default(''),
  date:      z.string().min(1),
  amount:    z.number(),
  note:      z.string().default(''),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const expenses = await prisma.brokerExpense.findMany({
      where:   { brokerId: params.id },
      orderBy: { date: 'desc' },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    return NextResponse.json(expenses);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const date = parseLocalDate(parsed.data.date);
  if (!date) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  try {
    const broker = await prisma.broker.findUnique({ where: { id: params.id } });
    if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 });

    // Validate cab number if provided — must be a registered vehicle for this broker
    if (parsed.data.cabNumber) {
      const cab = await prisma.brokerVehicle.findFirst({
        where: { cabNumber: parsed.data.cabNumber, brokerId: params.id },
      });
      if (!cab) {
        return NextResponse.json(
          { error: `Cab #${parsed.data.cabNumber} is not registered for this broker.` },
          { status: 422 }
        );
      }
    }

    const expense = await prisma.brokerExpense.create({
      data: { ...parsed.data, brokerId: params.id, date },
      include: { attachments: true },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
