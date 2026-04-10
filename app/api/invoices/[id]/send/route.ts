import { NextRequest, NextResponse } from 'next/server';
import { format } from 'date-fns';
import { prisma } from '@/lib/db';
import { renderInvoicePDF } from '@/lib/pdf';
import { sendInvoiceEmail } from '@/lib/email';
import type { Company, Ride, Invoice } from '@prisma/client';

export async function POST(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { company: true, rides: true },
    });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    const pdfBuffer = await renderInvoicePDF(
      invoice.company as Company,
      invoice.rides as Ride[],
      invoice as Invoice
    );

    let emailError: string | null = null;
    try {
      await sendInvoiceEmail({
        to: invoice.company.email,
        invoiceNumber: invoice.invoiceNumber,
        month: invoice.month,
        year: invoice.year,
        pdfBuffer,
      });
    } catch (err) {
      emailError = String(err);
    }

    const updated = await prisma.invoice.update({
      where: { id: params.id },
      data: {
        status:   'PENDING',
        dateSent: format(new Date(), 'yyyy-MM-dd'),
      },
    });

    return NextResponse.json({ success: true, emailError, invoice: updated });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
