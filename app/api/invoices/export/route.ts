import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renderInvoiceListPDF, type InvoiceListRow } from '@/lib/pdf';

/**
 * GET /api/invoices/export?month=&year=&status=&companyId=
 * Streams a landscape PDF listing all invoices matching the filter.
 * Empty filters = all invoices.
 */
export async function GET(request: NextRequest) {
  const sp = new URL(request.url).searchParams;
  const month     = sp.get('month')     ?? '';
  const year      = sp.get('year')      ?? '';
  const status    = sp.get('status')    ?? '';
  const companyId = sp.get('companyId') ?? '';

  const where: any = {};
  if (month)     where.month     = month;
  if (year)      where.year      = parseInt(year);
  if (status)    where.status    = status;
  if (companyId) where.companyId = companyId;

  try {
    const invoices = await prisma.invoice.findMany({
      where,
      include: { company: { select: { companyName: true } } },
      orderBy: [{ year: 'desc' }, { invoiceNumber: 'desc' }],
    });

    const rows: InvoiceListRow[] = invoices.map((inv) => ({
      invoiceNumber: inv.invoiceNumber,
      companyName:   inv.company.companyName,
      month:         inv.month,
      year:          inv.year,
      status:        inv.status,
      dateSent:      inv.dateSent ?? '',
      total:         inv.total,
    }));

    // Build a human-readable filter label for the PDF subheader
    const parts: string[] = [];
    if (month)     parts.push(month);
    if (year)      parts.push(year);
    if (status)    parts.push(status);
    if (parts.length === 0) parts.push('All invoices');
    const filterLabel = parts.join(' · ');

    const pdf = await renderInvoiceListPDF(rows, filterLabel);

    return new NextResponse(pdf as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="invoices-${year || 'all'}.pdf"`,
      },
    });
  } catch (err) {
    console.error('invoices list PDF generation failed:', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
