import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

const createSchema = z.object({
  name:            z.string().min(1),
  phone:           z.string().default(''),
  email:           z.string().default(''),
  billingDay:      z.number().int().min(1).max(31).default(1),
  standRentAmount: z.number().min(0).default(200),
  startDate:       z.string().min(1), // ISO date string from frontend
});

export async function GET() {
  try {
    const brokers = await prisma.broker.findMany({
      orderBy: { name: 'asc' },
      include: { transactions: true, vehicles: { where: { isActive: true } } },
    });
    return NextResponse.json(brokers);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const startDate = parseLocalDate(parsed.data.startDate);
  if (!startDate) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });

  try {
    const broker = await prisma.broker.create({
      data: {
        name:            parsed.data.name,
        phone:           parsed.data.phone,
        email:           parsed.data.email,
        billingDay:      parsed.data.billingDay,
        standRentAmount: parsed.data.standRentAmount,
        startDate,
        isActive:        true,
      },
    });
    return NextResponse.json(broker, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
