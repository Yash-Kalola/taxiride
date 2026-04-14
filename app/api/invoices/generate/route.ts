import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addDays, format } from 'date-fns';
import { prisma } from '@/lib/db';
import { Prisma } from '@prisma/client';
import { calcBase, calcHST } from '@/lib/tax';
import { INVOICE_NUMBER_SEED, MONTHS } from '@/lib/constants';

const bodySchema = z.object({
  companyId:    z.string().min(1),
  month:        z.string().min(1),
  year:         z.coerce.number().int(),
  invoiceDate:  z.string().optional(),   // optional custom invoice date (yyyy-MM-dd)
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { companyId, month, year, invoiceDate } = parsed.data;

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    // Wrap in serializable transaction to prevent concurrent invoice generation
    // from claiming the same rides
    const result = await prisma.$transaction(async (tx) => {
      const rides = await tx.ride.findMany({
        where: { companyId, month, year, invoiceId: null, voided: false },
      });
      if (rides.length === 0) return null;

      // Tax calculations
      const grandTotal = rides.reduce((s, r) => s + r.amount, 0);
      const base = calcBase(grandTotal);
      const hst  = calcHST(grandTotal);

      // Next invoice number
      const maxInvoice = await tx.invoice.findFirst({ orderBy: { invoiceNumber: 'desc' } });
      const invoiceNumber = (maxInvoice?.invoiceNumber ?? INVOICE_NUMBER_SEED - 1) + 1;

      const baseDate = invoiceDate ? new Date(invoiceDate + 'T00:00:00') : new Date();

      // Flag if current total dropped below the most recent prior invoice for this company
      const priorInvoices = await tx.invoice.findMany({
        where: { companyId },
        select: { total: true, month: true, year: true },
      });
      const toMonthNum = (inv: { year: number; month: string }) =>
        inv.year * 12 + (MONTHS as readonly string[]).indexOf(inv.month);
      priorInvoices.sort((a, b) => toMonthNum(b) - toMonthNum(a));
      const previousInvoice = priorInvoices[0] ?? null;
      const flagged = previousInvoice ? grandTotal < previousInvoice.total : false;

      const invoice = await tx.invoice.create({
        data: {
          invoiceNumber,
          companyId,
          month,
          year,
          amountPreTax: base,
          hst,
          total: grandTotal,
          dateSent:  invoiceDate ? format(baseDate, 'yyyy-MM-dd') : '',
          dueDate:   format(addDays(baseDate, 30), 'yyyy-MM-dd'),
          status:    'DRAFT',
          flagged,
          rides:     { connect: rides.map((r) => ({ id: r.id })) },
        },
      });

      return { invoiceId: invoice.id, invoiceNumber, flagged };
    }, { isolationLevel: Prisma.TransactionIsolationLevel.Serializable });

    if (!result) {
      return NextResponse.json({ error: `No uninvoiced rides for ${company.companyName} in ${month} ${year}` }, { status: 422 });
    }

    return NextResponse.json({ success: true, ...result });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
