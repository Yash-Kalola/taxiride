import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { renderDriverReportPDF, DriverReportSheet } from '@/lib/driver-report-pdf';
import { MONTHS } from '@/lib/constants';

/**
 * GET /api/drivers/[id]/report?month=4&year=2026
 * Generates a monthly driver report PDF: all shifts in the month grouped
 * by 10-day payout period, with per-period and month-total driver pay.
 */
export async function GET(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const url   = new URL(request.url);
    const month = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1));
    const year  = parseInt(url.searchParams.get('year')  || String(new Date().getFullYear()));

    if (!month || !year || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: 'month (1-12) and year are required' }), { status: 400 });
    }

    const driver = await prisma.driver.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true, phone: true, licenseNumber: true },
    });
    if (!driver) return new Response(JSON.stringify({ error: 'Driver not found' }), { status: 404 });

    const sheetsRaw = await prisma.dailySheet.findMany({
      where:   { driverId: driver.id, month, year },
      orderBy: [{ payoutPeriod: 'asc' }, { date: 'asc' }, { shift: 'asc' }],
    });

    const sheets: DriverReportSheet[] = sheetsRaw.map((s) => ({
      date:          s.date.toISOString(),
      shift:         s.shift as 'MORNING' | 'EVENING',
      vehicleNumber: s.vehicleNumber,
      payoutPeriod:  s.payoutPeriod,
      driverPay:     s.companyNet ?? 0,  // per-shift driver pay = companyNet
      isPaid:        s.isPaid,
    }));

    const pdfBuffer = await renderDriverReportPDF({
      driverName:    driver.name,
      driverPhone:   driver.phone    || undefined,
      licenseNumber: driver.licenseNumber || undefined,
      month,
      year,
      sheets,
    });

    const safeName  = driver.name.replace(/[^a-zA-Z0-9]/g, '-');
    const monthName = MONTHS[month - 1];
    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="DriverReport-${safeName}-${monthName}-${year}.pdf"`,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
