import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

/**
 * GET  /api/company-expenses?month=4&year=2026&category=RENT&paid=false
 *   — list company expenses with optional filters
 * POST /api/company-expenses  { date, amount, category, note, paid? }
 *   — create a new company expense
 */

const createSchema = z.object({
  date:          z.string().min(1),
  amount:        z.number(),
  category:      z.string().default('OTHER'),
  vehicleNumber: z.string().default(''),     // cab # when expense is per-vehicle (e.g. repair)
  note:          z.string().default(''),
  paid:          z.boolean().default(false),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const month         = url.searchParams.get('month');
  const year          = url.searchParams.get('year');
  const category      = url.searchParams.get('category');
  const vehicleNumber = url.searchParams.get('vehicleNumber');
  const paid          = url.searchParams.get('paid');

  try {
    const where: any = {};
    if (month)         where.month         = parseInt(month);
    if (year)          where.year          = parseInt(year);
    if (category)      where.category      = category;
    if (vehicleNumber) where.vehicleNumber = vehicleNumber;
    if (paid === 'true')  where.paid = true;
    if (paid === 'false') where.paid = false;

    const expenses = await prisma.companyExpense.findMany({
      where,
      orderBy: { date: 'desc' },
      include: { attachments: { orderBy: { createdAt: 'desc' } } },
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
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const d = parsed.data;
  const date = parseLocalDate(d.date);
  if (!date) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  try {
    const expense = await prisma.companyExpense.create({
      data: {
        date,
        amount:        d.amount,
        category:      d.category.trim() || 'OTHER',
        vehicleNumber: d.vehicleNumber.trim(),
        note:          d.note,
        paid:          d.paid,
        paidDate:      d.paid ? new Date() : null,
        month:         date.getMonth() + 1,
        year:          date.getFullYear(),
      },
      include: { attachments: true },
    });
    return NextResponse.json(expense, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
