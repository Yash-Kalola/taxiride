import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  cabNumber:       z.string().min(1),
  brokerId:        z.string().nullable().optional(),
  isCompanyCar:    z.boolean().default(false),
  insuranceAmount: z.number().default(0),
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

  // Update all PENDING stand rent for this month to reflect the new vehicle count
  const pending = await prisma.brokerTransaction.findMany({
    where: { brokerId, type: 'STAND_RENT', month, year, status: 'PENDING' },
  });

  for (const tx of pending) {
    // Parse old description to extract week label and preserve late fee if present
    const hasLate = tx.description.includes('+ $30 late');
    const basePart = tx.description.replace(/ \+ \$30 late$/, '');
    // Extract week label (everything before the parentheses)
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

export async function GET() {
  try {
    const vehicles = await prisma.brokerVehicle.findMany({
      orderBy: { cabNumber: 'asc' },
      include: { broker: { select: { id: true, name: true } } },
    });
    return NextResponse.json(vehicles);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(req: NextRequest) {
  const body = await req.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const vehicle = await prisma.brokerVehicle.create({
      data: parsed.data,
      include: {
        broker:    { select: { id: true, name: true } },
        accidents: { orderBy: { date: 'desc' } },
        documents: { orderBy: { createdAt: 'desc' } },
      },
    });

    // Recalculate pending stand rent if vehicle was assigned to a broker
    if (parsed.data.brokerId) {
      await recalcPendingStandRent(parsed.data.brokerId);
    }

    return NextResponse.json(vehicle, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
