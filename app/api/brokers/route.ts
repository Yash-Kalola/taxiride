import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  name:       z.string().min(1),
  phone:      z.string().default(''),
  billingDay: z.number().int().min(1).max(31).default(1),
  startDate:  z.string().min(1), // ISO date string from frontend
});

export async function GET() {
  try {
    const brokers = await prisma.broker.findMany({
      orderBy: { name: 'asc' },
      include: { transactions: true, vehicles: { where: { isActive: true } } },
    });
    return NextResponse.json(brokers);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const broker = await prisma.broker.create({
      data: {
        name:       parsed.data.name,
        phone:      parsed.data.phone,
        billingDay: parsed.data.billingDay,
        startDate:  new Date(parsed.data.startDate),
        isActive:   true,
      },
    });
    return NextResponse.json(broker, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
