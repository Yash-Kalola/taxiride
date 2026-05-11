import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renderOverviewPDF } from '@/lib/pdf';

/**
 * GET /api/overview/pdf?year=YYYY
 * Streams a landscape PDF of the monthly overview grid for the year.
 */
export async function GET(request: NextRequest) {
  const { searchParams } = new URL(request.url);
  const year = parseInt(searchParams.get('year') || String(new Date().getFullYear()));
  if (isNaN(year)) {
    return NextResponse.json({ error: 'Invalid year' }, { status: 400 });
  }

  try {
    const [companies, invoices] = await Promise.all([
      prisma.company.findMany({ select: { id: true, companyName: true }, orderBy: { companyName: 'asc' } }),
      prisma.invoice.findMany({
        where:  { year },
        select: { companyId: true, month: true, total: true, status: true },
      }),
    ]);

    // Build per-company × per-month totals
    const rows = companies.map((co) => {
      const byMonth: Record<string, number> = {};
      for (const inv of invoices.filter((i) => i.companyId === co.id)) {
        byMonth[inv.month] = (byMonth[inv.month] ?? 0) + inv.total;
      }
      return { companyName: co.companyName, byMonth };
    });

    const monthTotals: Record<string, number> = {};
    for (const inv of invoices) {
      monthTotals[inv.month] = (monthTotals[inv.month] ?? 0) + inv.total;
    }
    const grandTotal = invoices.reduce((s, i) => s + i.total, 0);

    const pdf = await renderOverviewPDF({
      year,
      rows,
      monthTotals,
      grandTotal,
      invoiceCount: invoices.length,
      companyCount: companies.length,
      generatedAt:  new Date(),
    });

    return new NextResponse(pdf as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="overview-${year}.pdf"`,
      },
    });
  } catch (err) {
    console.error('overview PDF generation failed:', err);
    return NextResponse.json({ error: 'PDF generation failed' }, { status: 500 });
  }
}
