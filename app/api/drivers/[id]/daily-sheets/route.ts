import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { computePayBreakdown, computePayoutPeriod } from '@/lib/driver-pay';
import { syncDraftPayout } from '@/lib/payout-sync';
import { parseLocalDate } from '@/lib/dates';

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
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const d = parsed.data;
  const date = parseLocalDate(d.date);
  if (!date) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });

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

    // Keep a pending DRAFT payout in sync with this new sheet (no-op if
    // the payout doesn't exist yet or is already PAID).
    await syncDraftPayout({
      driverId:     sheet.driverId,
      payoutPeriod: sheet.payoutPeriod,
      month:        sheet.month,
      year:         sheet.year,
    });

    return NextResponse.json(sheet, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'A daily sheet for this driver, date and shift already exists.' },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
