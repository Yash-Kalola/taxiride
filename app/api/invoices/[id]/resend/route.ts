import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renderInvoicePDF } from '@/lib/pdf';
import { sendInvoiceEmail } from '@/lib/email';
import type { Company, Ride, Invoice } from '@prisma/client';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const fromOverride = typeof body?.from === 'string' && body.from ? body.from : undefined;

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { company: true, rides: { where: { voided: false } } },
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
        from:          fromOverride,
        invoiceNumber: invoice.invoiceNumber,
        month:         invoice.month,
        year:          invoice.year,
        total:         invoice.total,
        // dueDate is stored as string ('' when missing). Pass only when set.
        dueDate:       invoice.dueDate || undefined,
        companyName:   invoice.company.companyName,
        pdfBuffer,
      });
    } catch (err: any) {
      console.error('sendInvoiceEmail failed:', err);
      emailError = typeof err?.message === 'string' ? err.message : 'Failed to send email';
    }

    // Return the full invoice so the client can refresh state, matching the
    // shape returned by /send.
    return NextResponse.json({ success: true, emailError, invoice });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
