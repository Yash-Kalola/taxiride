import { NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { subMonths, format, startOfMonth, endOfMonth } from 'date-fns';

export async function GET() {
  try {
    // Build the last 6 months (inclusive of current)
    const now = new Date();
    const months: { label: string; month: number; year: number }[] = [];
    for (let i = 5; i >= 0; i--) {
      const d = subMonths(now, i);
      months.push({ label: format(d, 'MMM yyyy'), month: d.getMonth() + 1, year: d.getFullYear() });
    }

    const brokers = await prisma.broker.findMany({
      orderBy: { name: 'asc' },
      include: {
        transactions: {
          where: {
            OR: months.map((m) => ({ month: m.month, year: m.year })),
          },
        },
        vehicles: { where: { isActive: true }, select: { cabNumber: true, isCompanyCar: true } },
      },
    });

    // Build grid: brokerId → monthKey → { net, count }
    type CellData = { net: number; count: number };
    const grid: Record<string, Record<string, CellData>> = {};

    for (const broker of brokers) {
      grid[broker.id] = {};
      for (const m of months) {
        const key = `${m.year}-${String(m.month).padStart(2, '0')}`;
        const txs = broker.transactions.filter((t) => t.month === m.month && t.year === m.year);
        if (txs.length === 0) continue;
        const net = txs.reduce((sum, t) => {
          return t.type === 'PAYOUT' ? sum - t.amount : sum + t.amount;
        }, 0);
        grid[broker.id][key] = { net, count: txs.length };
      }
    }

    return NextResponse.json({
      brokers: brokers.map((b) => ({ id: b.id, name: b.name, isActive: b.isActive, vehicles: b.vehicles })),
      months:  months.map((m) => ({ label: m.label, key: `${m.year}-${String(m.month).padStart(2, '0')}` })),
      grid,
    });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
