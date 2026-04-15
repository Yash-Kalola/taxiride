import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { computePayBreakdown, computePayoutPeriod } from '@/lib/driver-pay';

/**
 * GET  /api/daily-sheets      — master list with filters (driverId, vehicleNumber, month, year, shift, isPaid)
 * POST /api/daily-sheets      — bulk-create (array of sheets)
 * PATCH /api/daily-sheets    — bulk mark paid/unpaid by filter (body: { ids: string[], isPaid: boolean })
 */

const bulkCreateSchema = z.object({
  sheets: z.array(z.object({
    driverId:              z.string().min(1),
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
  })).min(1),
});

const bulkPaySchema = z.object({
  ids:    z.array(z.string().min(1)).min(1),
  isPaid: z.boolean(),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const driverId      = url.searchParams.get('driverId');
  const vehicleNumber = url.searchParams.get('vehicleNumber');
  const month         = url.searchParams.get('month');
  const year          = url.searchParams.get('year');
  const shift         = url.searchParams.get('shift');
  const isPaid        = url.searchParams.get('isPaid');

  try {
    const where: any = {};
    if (driverId)      where.driverId      = driverId;
    if (vehicleNumber) where.vehicleNumber = vehicleNumber;
    if (month)         where.month         = parseInt(month);
    if (year)          where.year          = parseInt(year);
    if (shift === 'MORNING' || shift === 'EVENING') where.shift = shift;
    if (isPaid === 'true')  where.isPaid = true;
    if (isPaid === 'false') where.isPaid = false;

    const sheets = await prisma.dailySheet.findMany({
      where,
      orderBy: [{ date: 'desc' }, { shift: 'asc' }],
      include: { driver: { select: { id: true, name: true } } },
    });
    return NextResponse.json(sheets);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bulkCreateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const created = await prisma.$transaction(
      parsed.data.sheets.map((s) => {
        const date = new Date(s.date);
        const breakdown = computePayBreakdown({
          grossEarnings:         s.grossEarnings,
          gasDeduction:          s.gasDeduction,
          debitFee:              s.debitFee,
          debitTransactionCount: s.debitTransactionCount,
          callChargeDeduction:   s.callChargeDeduction,
          extraExpenseDeduction: s.extraExpenseDeduction,
        });
        return prisma.dailySheet.create({
          data: {
            driverId:              s.driverId,
            vehicleNumber:         s.vehicleNumber,
            date,
            shift:                 s.shift,
            grossEarnings:         s.grossEarnings,
            gasDeduction:          s.gasDeduction,
            debitFee:              s.debitFee,
            debitTransactionCount: s.debitTransactionCount,
            callChargeDeduction:   s.callChargeDeduction,
            extraExpenseDeduction: s.extraExpenseDeduction,
            extraExpenseNote:      s.extraExpenseNote,
            hoursWorked:           s.hoursWorked,
            netDriverPay:          breakdown.driverPay,
            companyNet:            breakdown.companyNet,
            payoutPeriod:          computePayoutPeriod(date),
            month:                 date.getMonth() + 1,
            year:                  date.getFullYear(),
          },
        });
      })
    );
    return NextResponse.json({ count: created.length, sheets: created }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bulkPaySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const result = await prisma.dailySheet.updateMany({
      where: { id: { in: parsed.data.ids } },
      data:  {
        isPaid:   parsed.data.isPaid,
        paidDate: parsed.data.isPaid ? new Date() : null,
      },
    });
    return NextResponse.json({ updated: result.count });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
