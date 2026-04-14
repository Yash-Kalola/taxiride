import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  name:                    z.string().min(1).optional(),
  phone:                   z.string().optional(),
  billingDay:              z.number().int().min(1).max(31).optional(),
  standRentAmount:         z.number().min(0).optional(),
  startDate:               z.string().optional(),
  endDate:                 z.string().nullable().optional(),
  isActive:                z.boolean().optional(),
  updatePendingStandRent:  z.boolean().optional(), // recalc all PENDING stand rent with new rate
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const broker = await prisma.broker.findUnique({
      where: { id: params.id },
      include: {
        transactions:    { orderBy: { createdAt: 'desc' } },
        vehicles:        { orderBy: { cabNumber: 'asc' } },
        expenses:        { orderBy: { date: 'desc' } },
        recurringCharges: { orderBy: { createdAt: 'desc' } },
      },
    });
    if (!broker) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(broker);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const { updatePendingStandRent, ...fields } = parsed.data;
    const data: Record<string, unknown> = { ...fields };
    if (fields.startDate) data.startDate = new Date(fields.startDate);
    if (fields.endDate)   data.endDate   = new Date(fields.endDate);
    if (fields.endDate === null) data.endDate = null;

    const broker = await prisma.broker.update({ where: { id: params.id }, data });

    // If standRentAmount changed and user opted to update pending transactions
    if (updatePendingStandRent && fields.standRentAmount !== undefined) {
      const newRate = fields.standRentAmount;
      const vehicles = await prisma.brokerVehicle.count({
        where: { brokerId: params.id, isActive: true },
      });
      const vehicleCount = vehicles || 1;

      const pendingRent = await prisma.brokerTransaction.findMany({
        where: { brokerId: params.id, type: 'STAND_RENT', status: 'PENDING' },
      });

      for (const tx of pendingRent) {
        // Parse the description to check for late fees
        const hasLateFee = tx.description.includes('+ $30 late');
        const lateFeeAmount = hasLateFee ? 30 * vehicleCount : 0;
        const newAmount = (newRate * vehicleCount) + lateFeeAmount;

        // Update description with new rate
        const newDesc = tx.description.replace(
          /\(\d+ cabs? × \$\d+\)/,
          `(${vehicleCount} cab${vehicleCount !== 1 ? 's' : ''} × $${newRate})`
        );

        await prisma.brokerTransaction.update({
          where: { id: tx.id },
          data: { amount: newAmount, description: newDesc },
        });
      }
    }

    return NextResponse.json(broker);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.broker.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
