import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { computePayBreakdown, computePayoutPeriod } from '@/lib/driver-pay';

const createSchema = z.object({
  vehicleNumber:         z.string().min(1),
  date:                  z.string().min(1),
  shift:                 z.enum(['MORNING', 'EVENING']),
  grossEarnings:         z.number(),
  gasDeduction:          z.number().default(0),
  debitFee:              z.number().default(0),
  debitTransactionCount: z.number().int().min(0).default(0),
  callChargeDeduction:   z.number().default(0),
  extraExpenseDeduction: z.number().default(0),
  extraExpenseNote:      z.string().default(''),
  hoursWorked:           z.number().min(0).default(0),
});

export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  const url = new URL(request.url);
  const month = url.searchParams.get('month');
  const year  = url.searchParams.get('year');

  try {
    const where: any = { driverId: params.id };
    if (month) where.month = parseInt(month);
    if (year)  where.year  = parseInt(year);

    const sheets = await prisma.dailySheet.findMany({
      where,
      orderBy: { date: 'desc' },
    });
    return NextResponse.json(sheets);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const date = new Date(d.date);
  if (isNaN(date.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

  const breakdown = computePayBreakdown({
    grossEarnings:         d.grossEarnings,
    gasDeduction:          d.gasDeduction,
    debitFee:              d.debitFee,
    debitTransactionCount: d.debitTransactionCount,
    callChargeDeduction:   d.callChargeDeduction,
    extraExpenseDeduction: d.extraExpenseDeduction,
  });

  try {
    const driver = await prisma.driver.findUnique({ where: { id: params.id } });
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const sheet = await prisma.dailySheet.create({
      data: {
        driverId:              params.id,
        vehicleNumber:         d.vehicleNumber,
        date,
        shift:                 d.shift,
        grossEarnings:         d.grossEarnings,
        gasDeduction:          d.gasDeduction,
        debitFee:              d.debitFee,
        debitTransactionCount: d.debitTransactionCount,
        callChargeDeduction:   d.callChargeDeduction,
        extraExpenseDeduction: d.extraExpenseDeduction,
        extraExpenseNote:      d.extraExpenseNote,
        hoursWorked:           d.hoursWorked,
        netDriverPay:          breakdown.driverPay,
        companyNet:            breakdown.companyNet,
        payoutPeriod:          computePayoutPeriod(date),
        month:                 date.getMonth() + 1,
        year:                  date.getFullYear(),
      },
    });
    return NextResponse.json(sheet, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
