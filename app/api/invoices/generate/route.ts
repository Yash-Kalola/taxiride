import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addDays, format } from 'date-fns';
import { prisma } from '@/lib/db';
import { calcBase, calcHST } from '@/lib/tax';
import { INVOICE_NUMBER_SEED, MONTHS } from '@/lib/constants';

const bodySchema = z.object({
  companyId: z.string().min(1),
  month:     z.string().min(1),
  year:      z.coerce.number().int(),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { companyId, month, year } = parsed.data;

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    const rides = await prisma.ride.findMany({
      where: { companyId, month, year, invoiceId: null, voided: false },
    });
    if (rides.length === 0) {
      return NextResponse.json({ error: `No uninvoiced rides for ${company.companyName} in ${month} ${year}` }, { status: 422 });
    }

    // Tax calculations
    const grandTotal = rides.reduce((s, r) => s + r.amount, 0);
    const base = calcBase(grandTotal);
    const hst  = calcHST(grandTotal);

    // Next invoice number
    const maxInvoice = await prisma.invoice.findFirst({ orderBy: { invoiceNumber: 'desc' } });
    const invoiceNumber = (maxInvoice?.invoiceNumber ?? INVOICE_NUMBER_SEED - 1) + 1;

    const today = new Date();

    // Flag if current total dropped below the most recent prior invoice for this company
    const priorInvoices = await prisma.invoice.findMany({
      where: { companyId },
      select: { total: true, month: true, year: true },
    });
    const toMonthNum = (inv: { year: number; month: string }) =>
      inv.year * 12 + (MONTHS as readonly string[]).indexOf(inv.month);
    priorInvoices.sort((a, b) => toMonthNum(b) - toMonthNum(a));
    const previousInvoice = priorInvoices[0] ?? null;
    const flagged = previousInvoice ? grandTotal < previousInvoice.total : false;

    const invoice = await prisma.invoice.create({
      data: {
        invoiceNumber,
        companyId,
        month,
        year,
        amountPreTax: base,
        hst,
        total: grandTotal,
        dueDate:   format(addDays(today, 30), 'yyyy-MM-dd'),
        status:    'DRAFT',
        flagged,
        rides:     { connect: rides.map((r) => ({ id: r.id })) },
      },
      include: { company: true, rides: true },
    });

    return NextResponse.json({ success: true, invoiceId: invoice.id, invoiceNumber, flagged });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
