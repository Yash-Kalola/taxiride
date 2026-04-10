import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { renderInvoicePDF } from '@/lib/pdf';
import type { Company, Ride, Invoice } from '@prisma/client';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: { company: true, rides: true },
    });
    if (!invoice) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

    const pdfBuffer = await renderInvoicePDF(
      invoice.company as Company,
      invoice.rides as Ride[],
      invoice as Invoice
    );

    return new Response(pdfBuffer, {
      headers: {
        'Content-Type': 'application/pdf',
        'Content-Disposition': `inline; filename="Invoice-${invoice.invoiceNumber}.pdf"`,
      },
    });
  } catch (err) {
    return new Response(JSON.stringify({ error: String(err) }), { status: 500 });
  }
}
