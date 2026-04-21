import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { formatWeekRange, getWeeksInMonth } from '@/lib/weeks';

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
  const maxWeeks = getWeeksInMonth(month, year);
  if (weekNumber > maxWeeks) {
    return NextResponse.json({ error: `Month ${month}/${year} only has ${maxWeeks} weeks` }, { status: 400 });
  }

  try {
    const broker = await prisma.broker.findUnique({
      where: { id: params.id },
      include: { vehicles: { where: { isActive: true } } },
    });
    if (!broker) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    const activeVehicles   = broker.vehicles;
    // Company-subleased cars don't pay stand rent — only the broker's own investor
    // vehicles are counted. If a broker has zero rentable vehicles, no stand rent
    // is billed (we skip creation entirely below).
    const rentableVehicles = activeVehicles.filter((v) => !v.isCompanyCar);
    const vehicleCount     = rentableVehicles.length;
    const rate             = broker.standRentAmount;
    const lateFee          = 30; // flat $30 per vehicle late fee

    const weekLabel = formatWeekRange(weekNumber, month, year);

    const result = await prisma.$transaction(async (tx) => {
      // Serializable isolation prevents duplicate stand rent creation from concurrent requests
      // Idempotency: count existing non-void STAND_RENT for this month/year
      // If count >= weekNumber, this week has already been generated
      const existingCount = await tx.brokerTransaction.count({
        where: { brokerId: params.id, type: 'STAND_RENT', month, year, status: { not: 'VOID' } },
      });
      if (existingCount >= weekNumber) {
        return { created: [], escalatedIds: [], escalatedCount: 0, skipped: true };
      }

      // 1. Escalate all PENDING stand rent for this month/year: add flat $30 per vehicle
      const pendingRent = await tx.brokerTransaction.findMany({
        where: { brokerId: params.id, type: 'STAND_RENT', month, year, status: 'PENDING' },
      });
      const escalatedIds: string[] = [];
      for (const t of pendingRent) {
        if (t.description.includes('+ $30 late')) continue; // already escalated
        const newAmount = t.amount + lateFee * vehicleCount;
        const newDesc   = `${t.description} + $30 late`;
        await tx.brokerTransaction.update({
          where: { id: t.id },
          data:  { amount: newAmount, description: newDesc },
        });
        escalatedIds.push(t.id);
      }

      // 2. Create new stand rent for this week at fresh rate
      // If there are zero rentable vehicles (all are company-subleased), skip.
      const created = [];
      if (vehicleCount > 0) {
        const newRent = await tx.brokerTransaction.create({
          data: {
            brokerId:    params.id,
            type:        'STAND_RENT',
            amount:      rate * vehicleCount,
            description: `${weekLabel} (${vehicleCount} cab${vehicleCount !== 1 ? 's' : ''} × $${rate})`,
            month,
            year,
            status:      'PENDING',
          },
        });
        created.push(newRent);
      }

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
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

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
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
