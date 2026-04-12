import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  name:            z.string().min(1).optional(),
  phone:           z.string().optional(),
  billingDay:      z.number().int().min(1).max(31).optional(),
  standRentAmount: z.number().min(0).optional(),
  startDate:       z.string().optional(),
  endDate:         z.string().nullable().optional(),
  isActive:        z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const broker = await prisma.broker.findUnique({
      where: { id: params.id },
      include: {
        transactions: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!broker) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(broker);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.startDate) data.startDate = new Date(parsed.data.startDate);
    if (parsed.data.endDate)   data.endDate   = new Date(parsed.data.endDate);
    if (parsed.data.endDate === null) data.endDate = null;

    const broker = await prisma.broker.update({ where: { id: params.id }, data });
    return NextResponse.json(broker);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.broker.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
