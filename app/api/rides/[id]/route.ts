import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { calcBase, calcHST } from '@/lib/tax';

const updateSchema = z.object({
  jobId:          z.string().optional(),
  vehicleNumber:  z.string().optional(),
  pickupLocation: z.string().optional(),
  dropoffLocation:z.string().optional(),
  passenger:      z.string().optional(),
  driver:         z.string().optional(),
  dateTime:       z.string().optional(),
  amount:         z.coerce.number().min(0).optional(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const ride = await prisma.ride.update({ where: { id: params.id }, data: parsed.data });
    return NextResponse.json(ride);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Fetch the ride first so we know which invoice (if any) to recalculate
    const ride = await prisma.ride.findUnique({ where: { id: params.id } });
    if (!ride) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    await prisma.ride.delete({ where: { id: params.id } });

    // If this ride belonged to an invoice, recalculate the invoice totals (excluding voided)
    if (ride.invoiceId) {
      const remainingRides = await prisma.ride.findMany({
        where: { invoiceId: ride.invoiceId, voided: false },
        select: { amount: true },
      });
      const newTotal = remainingRides.reduce((s, r) => s + r.amount, 0);
      const newBase  = calcBase(newTotal);
      const newHST   = calcHST(newTotal);

      await prisma.invoice.update({
        where: { id: ride.invoiceId },
        data:  { amountPreTax: newBase, hst: newHST, total: newTotal },
      });
    }

    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
