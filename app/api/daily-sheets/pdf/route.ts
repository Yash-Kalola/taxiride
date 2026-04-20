import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { renderDailySheetsPDF, DailySheetRow, DailySheetsPDFFilters } from '@/lib/daily-sheets-pdf';
import { MONTHS } from '@/lib/constants';

/**
 * GET /api/daily-sheets/pdf?driverId=&vehicleNumber=&month=&year=&shift=&isPaid=
 * Same filter surface as GET /api/daily-sheets — returns a filtered PDF export.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const driverId      = url.searchParams.get('driverId')      || '';
    const vehicleNumber = url.searchParams.get('vehicleNumber') || '';
    const monthStr      = url.searchParams.get('month')         || '';
    const yearStr       = url.searchParams.get('year')          || '';
    const shift         = url.searchParams.get('shift')         || '';
    const isPaid        = url.searchParams.get('isPaid')        || '';

    const month = parseInt(monthStr);
    const year  = parseInt(yearStr);
    if (!month || !year || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: 'month (1-12) and year are required' }), { status: 400 });
    }

    const where: any = { month, year };
    if (driverId)      where.driverId      = driverId;
    if (vehicleNumber) where.vehicleNumber = vehicleNumber;
    if (shift === 'MORNING' || shift === 'EVENING') where.shift = shift;
    if (isPaid === 'true')  where.isPaid = true;
    if (isPaid === 'false') where.isPaid = false;

    const sheets = await prisma.dailySheet.findMany({
      where,
      orderBy: [{ date: 'desc' }, { shift: 'asc' }],
      include: { driver: { select: { name: true } } },
    });

    // Resolve driver name for filter label if a driverId was supplied
    let driverName = '';
    if (driverId) {
      const d = await prisma.driver.findUnique({ where: { id: driverId }, select: { name: true } });
      driverName = d?.name || '';
    }

    const rows: DailySheetRow[] = sheets.map((s) => ({
      date:                  s.date.toISOString(),
      shift:                 s.shift as 'MORNING' | 'EVENING',
      driverName:            s.driver.name,
      vehicleNumber:         s.vehicleNumber,
      grossEarnings:         s.grossEarnings,
      debitFee:              s.debitFee,
      debitTransactionCount: s.debitTransactionCount,
      gasDeduction:          s.gasDeduction,
      callChargeDeduction:   s.callChargeDeduction,
      extraExpenseDeduction: s.extraExpenseDeduction,
      companyNet:            s.companyNet,
      isPaid:                s.isPaid,
    }));

    const filters: DailySheetsPDFFilters = {
      driverName,
      vehicleNumber,
      month,
      year,
      shift: (shift === 'MORNING' || shift === 'EVENING') ? shift : '',
      isPaid: (isPaid === 'true' || isPaid === 'false') ? isPaid : '',
    };

    const pdfBuffer = await renderDailySheetsPDF(rows, filters);
    const monthName = MONTHS[month - 1];
    const parts = [
      'DailySheets', monthName, String(year),
      driverName     && driverName.replace(/\s+/g, '-'),
      vehicleNumber  && `Cab${vehicleNumber}`,
      shift          && (shift === 'MORNING' ? 'AM' : 'PM'),
      isPaid         && (isPaid === 'true' ? 'Paid' : 'Unpaid'),
    ].filter(Boolean).join('-');

    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="${parts}.pdf"`,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
