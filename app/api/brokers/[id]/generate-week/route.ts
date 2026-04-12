import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const schema = z.object({
  month:      z.number().int().min(1).max(12),
  year:       z.number().int(),
  weekNumber: z.number().int().min(1).max(5),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { month, year, weekNumber } = parsed.data;

  try {
    const broker = await prisma.broker.findUnique({
      where: { id: params.id },
      include: { vehicles: { where: { isActive: true } } },
    });
    if (!broker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const activeVehicles = broker.vehicles;
    const vehicleCount   = activeVehicles.length || 1;
    const rate           = 200;

    const result = await prisma.$transaction(async (tx) => {
      // 1. Escalate all PENDING stand rent for this month/year to $230 × vehicleCount
      const pendingRent = await tx.brokerTransaction.findMany({
        where: { brokerId: params.id, type: 'STAND_RENT', month, year, status: 'PENDING' },
      });
      const escalatedIds: string[] = [];
      for (const t of pendingRent) {
        const newAmount = 230 * vehicleCount;
        if (t.amount !== newAmount) {
          await tx.brokerTransaction.update({
            where: { id: t.id },
            data:  { amount: newAmount, description: t.description.replace(/\$200/, '$230').replace(/\$\d+\)/, '$230)') },
          });
          escalatedIds.push(t.id);
        }
      }

      // 2. Create new stand rent for this week at $200
      const newRent = await tx.brokerTransaction.create({
        data: {
          brokerId:    params.id,
          type:        'STAND_RENT',
          amount:      rate * vehicleCount,
          description: `Week ${weekNumber} (${vehicleCount} cab${vehicleCount !== 1 ? 's' : ''} × $${rate})`,
          month,
          year,
          status:      'PENDING',
        },
      });
      const created = [newRent];

      // 3. If week 1: auto-generate insurance for company-subleased vehicles (if not already done)
      if (weekNumber === 1) {
        const existingInsurance = await tx.brokerTransaction.count({
          where: { brokerId: params.id, type: 'INSURANCE', month, year },
        });
        if (existingInsurance === 0) {
          const companyCabs = activeVehicles.filter(v => v.isCompanyCar && v.insuranceAmount > 0);
          for (const cab of companyCabs) {
            const ins = await tx.brokerTransaction.create({
              data: {
                brokerId:    params.id,
                type:        'INSURANCE',
                amount:      cab.insuranceAmount,
                description: `Insurance – Cab #${cab.cabNumber}`,
                month,
                year,
                status:      'PENDING',
              },
            });
            created.push(ins);
          }
        }
      }

      return { created, escalatedIds, escalatedCount: escalatedIds.length };
    });

    // Return created transactions + the updated (escalated) transactions for client state sync
    const escalatedTxs = result.escalatedIds.length > 0
      ? await prisma.brokerTransaction.findMany({ where: { id: { in: result.escalatedIds } } })
      : [];

    return NextResponse.json({
      created:      result.created,
      escalated:    escalatedTxs,
      escalatedIds: result.escalatedIds,
    }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
