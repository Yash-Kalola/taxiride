import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * POST /api/brokers/[id]/generate-recurring
 * Auto-generates transactions from recurring charges for the current month.
 * Idempotent: skips charges already generated this month (matched by description + month + year).
 */
export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const now   = new Date();
    const today = now.getDate();
    const month = now.getMonth() + 1;
    const year  = now.getFullYear();

    const charges = await prisma.recurringCharge.findMany({
      where: { brokerId: params.id, isActive: true, dayOfMonth: { lte: today } },
    });

    const created: any[] = [];
    for (const rc of charges) {
      // Idempotency: check if a matching transaction already exists this month
      const existing = await prisma.brokerTransaction.findFirst({
        where: {
          brokerId: params.id,
          month,
          year,
          description: { startsWith: `[RC] ${rc.description || rc.type}` },
          status: { not: 'VOID' },
        },
      });
      if (existing) continue;

      const dueDate = new Date(year, month - 1, rc.dayOfMonth);
      const tx = await prisma.brokerTransaction.create({
        data: {
          brokerId:    params.id,
          type:        rc.type,
          amount:      rc.amount,
          description: `[RC] ${rc.description || rc.type} (due ${rc.dayOfMonth}${ordinal(rc.dayOfMonth)} of each month)`,
          dueDate,
          month,
          year,
          status:      'PENDING',
        },
      });
      created.push(tx);
    }

    return NextResponse.json({ created, count: created.length }, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}
