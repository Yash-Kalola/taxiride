import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { computePayBreakdown, computePayoutPeriod } from '@/lib/driver-pay';
import { syncPayouts } from '@/lib/payout-sync';
import { parseLocalDate } from '@/lib/dates';

const updateSchema = z.object({
  vehicleNumber:         z.string().min(1).optional(),
  date:                  z.string().optional(),
  shift:                 z.enum(['MORNING', 'EVENING']).optional(),
  grossEarnings:         z.number().optional(),
  gasDeduction:          z.number().optional(),
  debitFee:              z.number().optional(),
  debitTransactionCount: z.number().int().min(0).optional(),
  callChargeDeduction:   z.number().optional(),
  extraExpenseDeduction: z.number().optional(),
  extraExpenseNote:      z.string().optional(),
  hoursWorked:           z.number().min(0).optional(),
  isPaid:                z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const sheet = await prisma.dailySheet.findUnique({
      where: { id: params.id },
      include: { driver: { select: { id: true, name: true } } },
    });
    if (!sheet) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(sheet);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const existing = await prisma.dailySheet.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const f = parsed.data;
    const data: Record<string, unknown> = { ...f };

    // Recompute derived fields if any inputs changed
    const dateChanged  = f.date !== undefined;
    const payChanged   = ['grossEarnings','gasDeduction','debitFee','debitTransactionCount','callChargeDeduction','extraExpenseDeduction']
      .some((k) => (f as any)[k] !== undefined);

    if (dateChanged) {
      const newDate = parseLocalDate(f.date!);
      if (!newDate) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
      data.date         = newDate;
      data.month        = newDate.getMonth() + 1;
      data.year         = newDate.getFullYear();
      data.payoutPeriod = computePayoutPeriod(newDate);
    }

    if (payChanged || dateChanged) {
      const breakdown = computePayBreakdown({
        grossEarnings:         f.grossEarnings         ?? existing.grossEarnings,
        gasDeduction:          f.gasDeduction          ?? existing.gasDeduction,
        debitFee:              f.debitFee              ?? existing.debitFee,
        debitTransactionCount: f.debitTransactionCount ?? existing.debitTransactionCount,
        callChargeDeduction:   f.callChargeDeduction   ?? existing.callChargeDeduction,
        extraExpenseDeduction: f.extraExpenseDeduction ?? existing.extraExpenseDeduction,
      });
      data.netDriverPay = breakdown.driverPay;
      data.companyNet   = breakdown.companyNet;
    }

    // paidDate tracking
    if (f.isPaid === true  && !existing.isPaid) data.paidDate = new Date();
    if (f.isPaid === false && existing.isPaid)  data.paidDate = null;

    const updated = await prisma.dailySheet.update({ where: { id: params.id }, data });

    // Sync DRAFT payouts for both the old and new period — if the sheet
    // moved across periods, both aggregates need a refresh.
    await syncPayouts([
      { driverId: existing.driverId, payoutPeriod: existing.payoutPeriod, month: existing.month, year: existing.year },
      { driverId: updated.driverId,  payoutPeriod: updated.payoutPeriod,  month: updated.month,  year: updated.year  },
    ]);

    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (err?.code === 'P2002') {
      return NextResponse.json(
        { error: 'Another sheet already exists for this driver, date and shift.' },
        { status: 409 }
      );
    }
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Grab the period info before delete so we can sync its payout after
    // (the payout may need totals refreshed, or reopening if it was PAID).
    const existing = await prisma.dailySheet.findUnique({
      where:  { id: params.id },
      select: { driverId: true, payoutPeriod: true, month: true, year: true },
    });

    await prisma.dailySheet.delete({ where: { id: params.id } });

    if (existing) {
      await syncPayouts([existing]);
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
