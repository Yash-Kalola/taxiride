import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

const updateSchema = z.object({
  date:          z.string().optional(),
  amount:        z.number().optional(),
  category:      z.string().optional(),
  vehicleNumber: z.string().optional(),
  note:          z.string().optional(),
  paid:          z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const expense = await prisma.companyExpense.findUnique({
      where: { id: params.id },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    if (!expense) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(expense);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const existing = await prisma.companyExpense.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const f = parsed.data;
    const data: Record<string, unknown> = {};

    if (f.date !== undefined) {
      const parsedDate = parseLocalDate(f.date);
      if (!parsedDate) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
      data.date  = parsedDate;
      data.month = parsedDate.getMonth() + 1;
      data.year  = parsedDate.getFullYear();
    }
    if (f.amount        !== undefined) data.amount        = f.amount;
    if (f.category      !== undefined) data.category      = f.category.trim() || 'OTHER';
    if (f.vehicleNumber !== undefined) data.vehicleNumber = f.vehicleNumber.trim();
    if (f.note          !== undefined) data.note          = f.note;

    // paidDate tracking
    if (f.paid === true && !existing.paid) {
      data.paid     = true;
      data.paidDate = new Date();
    } else if (f.paid === false && existing.paid) {
      data.paid     = false;
      data.paidDate = null;
    } else if (f.paid !== undefined) {
      data.paid = f.paid;
    }

    const updated = await prisma.companyExpense.update({
      where: { id: params.id },
      data,
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.companyExpense.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
