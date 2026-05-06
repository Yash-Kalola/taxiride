import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { calcBase, calcHST } from '@/lib/tax';

/**
 * GET  /api/invoices/[id]/rides  — list unbilled rides for the invoice's
 *                                  company that could be added to it.
 * POST /api/invoices/[id]/rides  — attach selected rides to this invoice
 *                                  and recompute totals.
 */

const attachSchema = z.object({
  rideIds: z.array(z.string().min(1)).min(1, 'Select at least one ride'),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where:  { id: params.id },
      select: { companyId: true, month: true, year: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    // Show rides for the SAME company that aren't on any invoice yet.
    // Matched on month/year by default but the office can clear filters.
    const rides = await prisma.ride.findMany({
      where: {
        companyId:  invoice.companyId,
        invoiceId:  null,
        voided:     false,
      },
      orderBy: [{ year: 'desc' }, { dateTime: 'desc' }],
      select: {
        id: true, jobId: true, dateTime: true,
        pickupLocation: true, dropoffLocation: true,
        vehicleNumber: true, amount: true,
        month: true, year: true,
      },
    });
    return NextResponse.json({
      invoiceMonth: invoice.month,
      invoiceYear:  invoice.year,
      rides,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = attachSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const invoice = await prisma.invoice.findUnique({ where: { id: params.id } });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    // Only attach rides that belong to the same company AND aren't already on
    // another invoice. Defensive guard against tampered payloads.
    const eligibleRides = await prisma.ride.findMany({
      where: {
        id:        { in: parsed.data.rideIds },
        companyId: invoice.companyId,
        invoiceId: null,
      },
      select: { id: true },
    });
    if (eligibleRides.length === 0) {
      return NextResponse.json({ error: 'No eligible rides to attach.' }, { status: 400 });
    }

    await prisma.ride.updateMany({
      where: { id: { in: eligibleRides.map(r => r.id) } },
      data:  { invoiceId: params.id },
    });

    // Recompute totals from all non-voided rides on the invoice.
    const remainingRides = await prisma.ride.findMany({
      where:  { invoiceId: params.id, voided: false },
      select: { amount: true },
    });
    const newTotal = remainingRides.reduce((s, r) => s + r.amount, 0);
    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data:  { amountPreTax: calcBase(newTotal), hst: calcHST(newTotal), total: newTotal },
      include: { company: true, rides: true },
    });
    return NextResponse.json({ attached: eligibleRides.length, invoice: updated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
