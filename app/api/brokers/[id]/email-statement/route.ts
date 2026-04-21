import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { renderBrokerStatementPDF } from '@/lib/broker-pdf';
import { sendEmailWithPDF } from '@/lib/email';
import { MONTHS, SENDER } from '@/lib/constants';
import { getCurrentSession } from '@/lib/auth';

const schema = z.object({
  month:   z.number().int().min(1).max(12),
  year:    z.number().int().min(2000).max(3000),
  to:      z.string().trim().toLowerCase().email(),
  from:    z.string().trim().toLowerCase().email(),
  subject: z.string().trim().max(300).optional(),
  message: z.string().trim().max(4000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { month, year, to, from, subject: subjectOverride, message } = parsed.data;
  const sess = await getCurrentSession();

  try {
    const broker = await prisma.broker.findUnique({
      where: { id: params.id },
      include: {
        vehicles: { select: { cabNumber: true } },
        expenses: true,
      },
    });
    if (!broker) return NextResponse.json({ error: 'Broker not found' }, { status: 404 });

    const transactions = await prisma.brokerTransaction.findMany({
      where: { brokerId: params.id, month, year },
      orderBy: { createdAt: 'asc' },
    });

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

    const cabNumbers = broker.vehicles.map((v) => v.cabNumber.trim());
    const monthName  = MONTHS[month - 1];
    let rides: { dateTime: string; pickupLocation: string; dropoffLocation: string; vehicleNumber: string; amount: number }[] = [];

    if (cabNumbers.length > 0) {
      rides = await prisma.ride.findMany({
        where:   { vehicleNumber: { in: cabNumbers }, month: monthName, year, voided: false },
        orderBy: { dateTime: 'asc' },
        select:  { dateTime: true, pickupLocation: true, dropoffLocation: true, vehicleNumber: true, amount: true },
      });
    }

    const pdfBuffer = await renderBrokerStatementPDF(
      { name: broker.name, phone: broker.phone },
      allRows,
      rides,
      month,
      year,
    );

    const subject = subjectOverride || `Monthly Statement — ${monthName} ${year}`;
    const text    = (message && message.trim()) || `Hello ${broker.name},\n\nPlease find your monthly broker statement for ${monthName} ${year} attached.\n\n${SENDER.name}`;
    const html    = `<p>${text.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;

    let status: 'SENT' | 'FAILED' = 'SENT';
    let errorMsg = '';
    try {
      await sendEmailWithPDF({
        to, from, subject, html, text,
        pdfBuffer,
        pdfFilename: `Statement-${broker.name.replace(/[^a-zA-Z0-9]/g, '-')}-${monthName}-${year}.pdf`,
      });
    } catch (err: any) {
      status = 'FAILED';
      errorMsg = err?.message || 'Email send failed';
    }

    const log = await prisma.emailLog.create({
      data: {
        recipientType:  'BROKER',
        recipientId:    broker.id,
        recipientEmail: to,
        fromAddress:    from,
        subject,
        month, year,
        sentById:       sess?.uid ?? null,
        status,
        error:          errorMsg,
      },
    });

    if (status === 'FAILED') {
      return NextResponse.json({ error: errorMsg || 'Send failed', log }, { status: 502 });
    }
    return NextResponse.json({ ok: true, log });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
