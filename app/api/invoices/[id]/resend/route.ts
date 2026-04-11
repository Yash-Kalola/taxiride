import { NextRequest, NextResponse } from 'next/server';
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
    if (!invoice.company.email) return NextResponse.json({ error: 'No email address on file for this company.' }, { status: 400 });

    const pdfBuffer = await renderInvoicePDF(
      invoice.company as Company,
      invoice.rides as Ride[],
      invoice as Invoice
    );

    let emailError: string | null = null;
    try {
      await sendInvoiceEmail({
        to:            invoice.company.email,
        invoiceNumber: invoice.invoiceNumber,
        month:         invoice.month,
        year:          invoice.year,
        total:         invoice.total,
        dueDate:       invoice.dueDate ?? undefined,
        companyName:   invoice.company.companyName,
        pdfBuffer,
      });
    } catch (err) {
      emailError = String(err);
    }

    return NextResponse.json({ success: true, emailError });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
