import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { renderBrokerStatementPDF } from '@/lib/broker-pdf';
import { MONTHS } from '@/lib/constants';

/**
 * GET /api/brokers/[id]/statement?month=4&year=2026
 * Returns a PDF statement for the broker's transactions and rides in the given month.
 */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const url = new URL(_.url);
    const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1));
    const year  = parseInt(url.searchParams.get('year')  || String(new Date().getFullYear()));

    if (isNaN(month) || isNaN(year) || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: 'Invalid month or year' }), { status: 400 });
    }

    const broker = await prisma.broker.findUnique({
      where: { id: params.id },
      include: {
        vehicles: { select: { cabNumber: true } },
        expenses: true,
      },
    });
    if (!broker) return new Response(JSON.stringify({ error: 'Broker not found' }), { status: 404 });

    // Fetch transactions for this month (excluding VOID)
    const transactions = await prisma.brokerTransaction.findMany({
      where: { brokerId: params.id, month, year },
      orderBy: { createdAt: 'asc' },
    });

    // Merge expenses for this month as virtual rows
    const monthStart = new Date(year, month - 1, 1);
    const monthEnd   = new Date(year, month, 0, 23, 59, 59);
    const expenses = broker.expenses.filter((e) => {
      const d = new Date(e.date);
      return d >= monthStart && d <= monthEnd;
    });

    const allRows = [
      ...transactions.map((t) => ({
        type:        t.type,
        description: t.description,
        amount:      t.amount,
        status:      t.status,
      })),
      ...expenses.map((e) => ({
        type:        'EXPENSE',
        description: `${e.cabNumber ? `Cab #${e.cabNumber}` : ''}${e.note ? (e.cabNumber ? ' — ' : '') + e.note : ''}` || '—',
        amount:      e.amount,
        status:      e.paid ? 'PAID' : 'PENDING',
      })),
    ];

    // Fetch rides via vehicle number matching
    const cabNumbers = broker.vehicles.map((v) => v.cabNumber.trim());
    const monthName  = MONTHS[month - 1];
    let rides: { dateTime: string; pickupLocation: string; dropoffLocation: string; vehicleNumber: string; amount: number }[] = [];

    if (cabNumbers.length > 0) {
      rides = await prisma.ride.findMany({
        where: { vehicleNumber: { in: cabNumbers }, month: monthName, year, voided: false },
        orderBy: { dateTime: 'asc' },
        select: { dateTime: true, pickupLocation: true, dropoffLocation: true, vehicleNumber: true, amount: true },
      });
    }

    const pdfBuffer = await renderBrokerStatementPDF(
      { name: broker.name, phone: broker.phone },
      allRows,
      rides,
      month,
      year,
    );

    const safeName = broker.name.replace(/[^a-zA-Z0-9]/g, '-');
    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Statement-${safeName}-${monthName}-${year}.pdf"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
