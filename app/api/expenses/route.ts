import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

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
      include: {
        broker:      { select: { id: true, name: true } },
        attachments: { orderBy: { createdAt: 'desc' } },
      },
    });
    return NextResponse.json(expenses);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const date = parseLocalDate(parsed.data.date);
  if (!date) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  try {
    // Validate cab number if provided — must be a registered vehicle for this broker
    if (parsed.data.cabNumber) {
      const cab = await prisma.brokerVehicle.findFirst({
        where: { cabNumber: parsed.data.cabNumber, brokerId: parsed.data.brokerId },
      });
      if (!cab) {
        return NextResponse.json(
          { error: `Cab #${parsed.data.cabNumber} is not registered for this broker.` },
          { status: 422 }
        );
      }
    }

    const expense = await prisma.brokerExpense.create({
      data: {
        brokerId:  parsed.data.brokerId,
        cabNumber: parsed.data.cabNumber,
        date,
        amount:    parsed.data.amount,
        note:      parsed.data.note,
      },
      include: {
        broker:      { select: { id: true, name: true } },
        attachments: true,
      },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
