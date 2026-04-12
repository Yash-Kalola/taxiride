import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { calcBase, calcHST } from '@/lib/tax';

/** PATCH /api/rides/[id]/void  — toggle voided on a ride and recalculate invoice totals */
export async function PATCH(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const ride = await prisma.ride.findUnique({ where: { id: params.id } });
    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Toggle voided
    const updated = await prisma.ride.update({
      where: { id: params.id },
      data:  { voided: !ride.voided },
    });

    let invoice = null;

    // Recalculate invoice totals (exclude all voided rides)
    if (ride.invoiceId) {
      const activeRides = await prisma.ride.findMany({
        where: { invoiceId: ride.invoiceId, voided: false },
        select: { amount: true },
      });
      const newTotal = activeRides.reduce((s, r) => s + r.amount, 0);
      const newBase  = calcBase(newTotal);
      const newHST   = calcHST(newTotal);

      invoice = await prisma.invoice.update({
        where: { id: ride.invoiceId },
        data:  { amountPreTax: newBase, hst: newHST, total: newTotal },
      });
    }

    return NextResponse.json({ ride: updated, invoice });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
