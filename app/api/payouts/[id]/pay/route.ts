import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { freezePayoutTotals } from '@/lib/payout-sync';

const schema = z.object({
  status:        z.enum(['DRAFT', 'PAID']).default('PAID'),
  notes:         z.string().optional(),
  markSheetsPaid: z.boolean().default(true),   // also flip dailySheet.isPaid for this period
});

/**
 * PATCH /api/payouts/[id]/pay   — mark the payout as PAID (or reopen to DRAFT)
 * When marking PAID, also flips all dailySheets in this period's (driverId, period, month, year) to isPaid=true.
 */
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => ({}));
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { status, notes, markSheetsPaid } = parsed.data;

  try {
    const payout = await prisma.driverPayout.findUnique({ where: { id: params.id } });
    if (!payout) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Freeze totals at the current sheet state before marking PAID, so the
    // stored snapshot reflects what was actually paid (not whatever was
    // computed when the payout was first generated).
    if (status === 'PAID' && payout.status !== 'PAID') {
      await freezePayoutTotals(payout.id);
    }

    const paidDate = status === 'PAID' ? new Date() : null;
    const updated = await prisma.driverPayout.update({
      where: { id: params.id },
      data:  { status, paidDate, ...(notes !== undefined ? { notes } : {}) },
    });

    if (markSheetsPaid) {
      await prisma.dailySheet.updateMany({
        where: {
          driverId:     payout.driverId,
          payoutPeriod: payout.payoutPeriod,
          month:        payout.month,
          year:         payout.year,
        },
        data:  {
          isPaid:   status === 'PAID',
          paidDate: status === 'PAID' ? new Date() : null,
        },
      });
    }

    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
