import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { computePayBreakdown, computePayoutPeriod } from '@/lib/driver-pay';

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
    return NextResponse.json({ error: String(err) }, { status: 500 });
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
      const newDate = new Date(f.date!);
      if (isNaN(newDate.getTime())) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
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
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.dailySheet.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
