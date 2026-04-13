import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  cabNumber:       z.string().min(1).optional(),
  brokerId:        z.string().nullable().optional(),
  isCompanyCar:    z.boolean().optional(),
  insuranceAmount: z.number().optional(),
  isActive:        z.boolean().optional(),
});

/** Recalculate PENDING stand rent for a broker's current month after vehicle count changes */
async function recalcPendingStandRent(brokerId: string) {
  const broker = await prisma.broker.findUnique({
    where: { id: brokerId },
    include: { vehicles: { where: { isActive: true } } },
  });
  if (!broker) return;

  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  const vehicleCount = broker.vehicles.length || 1;
  const rate = broker.standRentAmount;

  const pending = await prisma.brokerTransaction.findMany({
    where: { brokerId, type: 'STAND_RENT', month, year, status: 'PENDING' },
  });

  for (const tx of pending) {
    const hasLate = tx.description.includes('+ $30 late');
    const basePart = tx.description.replace(/ \+ \$30 late$/, '');
    const weekLabel = basePart.replace(/\s*\(.*\)$/, '');
    const newBase = rate * vehicleCount;
    const newAmount = hasLate ? newBase + 30 * vehicleCount : newBase;
    const newDesc = `${weekLabel} (${vehicleCount} cab${vehicleCount !== 1 ? 's' : ''} × $${rate})${hasLate ? ' + $30 late' : ''}`;
    await prisma.brokerTransaction.update({
      where: { id: tx.id },
      data: { amount: newAmount, description: newDesc },
    });
  }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const v = await prisma.brokerVehicle.findUnique({ where: { id: params.id }, include: { broker: true } });
    if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(v);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    // Get old vehicle to detect broker change
    const oldVehicle = await prisma.brokerVehicle.findUnique({ where: { id: params.id } });

    const v = await prisma.brokerVehicle.update({
      where: { id: params.id },
      data: parsed.data,
      include: {
        broker:     { select: { id: true, name: true } },
        accidents:  { orderBy: { date: 'desc' } },
        documents:  { orderBy: { createdAt: 'desc' } },
      },
    });

    // Recalculate stand rent for affected brokers when broker assignment or active status changes
    const brokerChanged = 'brokerId' in parsed.data && parsed.data.brokerId !== oldVehicle?.brokerId;
    const activeChanged = 'isActive' in parsed.data && parsed.data.isActive !== oldVehicle?.isActive;
    if (brokerChanged || activeChanged) {
      // Recalc for the new broker
      if (v.broker?.id) await recalcPendingStandRent(v.broker.id);
      // Recalc for the old broker (vehicle removed)
      if (brokerChanged && oldVehicle?.brokerId) await recalcPendingStandRent(oldVehicle.brokerId);
    }

    return NextResponse.json(v);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.brokerVehicle.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
