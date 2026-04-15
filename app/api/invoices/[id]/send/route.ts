import { NextRequest, NextResponse } from 'next/server';
import { format, addDays } from 'date-fns';
import { prisma } from '@/lib/db';
import { renderInvoicePDF } from '@/lib/pdf';
import { sendInvoiceEmail } from '@/lib/email';
import { parseLocalDate } from '@/lib/dates';
import type { Company, Ride, Invoice } from '@prisma/client';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Accept optional custom dates from the request body
    const body = await request.json().catch(() => ({}));
    const customDateSent = typeof body?.dateSent === 'string' && body.dateSent ? body.dateSent : null;
    const customDueDate  = typeof body?.dueDate  === 'string' && body.dueDate  ? body.dueDate  : null;

    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { company: true, rides: { where: { voided: false } } },
    });
    if (!invoice) return NextResponse.json({ error: 'Invoice not found' }, { status: 404 });

    // Use custom dates if provided, otherwise fall back to today / today+30.
    // parseLocalDate keeps "YYYY-MM-DD" anchored to local midnight so addDays+format
    // don't round-trip through UTC and shift the day.
    const today      = new Date();
    const dateSentStr = customDateSent || invoice.dateSent || format(today, 'yyyy-MM-dd');
    const dueDateStr  = customDueDate  || invoice.dueDate  || format(addDays(parseLocalDate(dateSentStr) ?? today, 30), 'yyyy-MM-dd');

    // Update invoice with dates BEFORE rendering PDF so the PDF shows the correct date
    const preUpdated = await prisma.invoice.update({
      where: { id: params.id },
      data: {
        status:   'PENDING',
        dateSent: dateSentStr,
        dueDate:  dueDateStr,
      },
      include: { company: true, rides: { where: { voided: false } } },
    });

    const pdfBuffer = await renderInvoicePDF(
      preUpdated.company as Company,
      preUpdated.rides as Ride[],
      preUpdated as unknown as Invoice
    );

    let emailError: string | null = null;
    try {
      await sendInvoiceEmail({
        to:            invoice.company.email,
        invoiceNumber: invoice.invoiceNumber,
        month:         invoice.month,
        year:          invoice.year,
        total:         invoice.total,
        dueDate:       dueDateStr,
        companyName:   invoice.company.companyName,
        pdfBuffer,
      });
    } catch (err: any) {
      console.error('sendInvoiceEmail failed:', err);
      emailError = typeof err?.message === 'string' ? err.message : 'Failed to send email';
    }

    return NextResponse.json({ success: true, emailError, invoice: preUpdated });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
