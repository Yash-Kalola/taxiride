import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/dashboard/brokers?month=4&year=2026
 *   — stats per broker + aggregate totals for the requested window.
 *   - month omitted → whole year (if year set) or all-time (if both omitted)
 *   - year  omitted → all-time (ignores month)
 *
 * Response: { aggregate, brokers }
 *   aggregate: { total, paid, pending, outflow, brokerCount }
 *   brokers:   [{ id, name, total, paid, pending, outflow }]  (sorted by total desc)
 */

export interface BrokerStatRow {
  id:       string;
  name:     string;
  total:    number;
  paid:     number;
  pending:  number;
  outflow:  number;
}

export async function GET(request: NextRequest) {
  const url   = new URL(request.url);
  const month = url.searchParams.get('month');
  const year  = url.searchParams.get('year');

  try {
    const where: Record<string, unknown> = { status: { not: 'VOID' } };
    if (year)             where.year  = parseInt(year);
    if (year && month)    where.month = parseInt(month);

    const txs = await prisma.brokerTransaction.findMany({
      where,
      select: {
        amount: true, type: true, status: true,
        brokerId: true, broker: { select: { id: true, name: true } },
      },
    });

    const byBroker = new Map<string, BrokerStatRow>();
    for (const t of txs) {
      const cur = byBroker.get(t.brokerId) ?? {
        id: t.brokerId, name: t.broker.name,
        total: 0, paid: 0, pending: 0, outflow: 0,
      };
      if (t.type === 'PAYOUT') {
        cur.outflow += t.amount;
        cur.total   -= t.amount;
      } else {
        if (t.status === 'PAID') cur.paid    += t.amount;
        else                     cur.pending += t.amount;
        cur.total += t.amount;
      }
      byBroker.set(t.brokerId, cur);
    }
    const brokers: BrokerStatRow[] = Array.from(byBroker.values())
      .sort((a, b) => b.total - a.total);

    const aggregate = brokers.reduce(
      (a, b) => ({
        total:   a.total   + b.total,
        paid:    a.paid    + b.paid,
        pending: a.pending + b.pending,
        outflow: a.outflow + b.outflow,
      }),
      { total: 0, paid: 0, pending: 0, outflow: 0 },
    );

    return NextResponse.json({
      aggregate: { ...aggregate, brokerCount: brokers.length },
      brokers,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
