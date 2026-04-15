import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { renderPayoutPDF, PayoutDriverData, PayoutSheet } from '@/lib/payout-pdf';
import { MONTHS } from '@/lib/constants';

/**
 * GET /api/payouts/pdf?period=1&month=4&year=2026
 * Multi-driver payout report: all payouts for a given period+month+year on one PDF.
 */
export async function GET(request: NextRequest) {
  try {
    const url = new URL(request.url);
    const period = parseInt(url.searchParams.get('period') || '0') as 1 | 2 | 3;
    const month  = parseInt(url.searchParams.get('month')  || '0');
    const year   = parseInt(url.searchParams.get('year')   || '0');

    if (!period || !month || !year || period < 1 || period > 3 || month < 1 || month > 12) {
      return new Response(JSON.stringify({ error: 'period (1-3), month (1-12), and year are required' }), { status: 400 });
    }

    const payouts = await prisma.driverPayout.findMany({
      where: { payoutPeriod: period, month, year },
      orderBy: { driver: { name: 'asc' } },
      include: { driver: { select: { name: true, phone: true } } },
    });

    if (payouts.length === 0) {
      return new Response(JSON.stringify({ error: 'No payouts for this period. Generate them first.' }), { status: 404 });
    }

    // Fetch all relevant daily sheets in one query
    const driverIds = payouts.map((p) => p.driverId);
    const allSheets = await prisma.dailySheet.findMany({
      where: { driverId: { in: driverIds }, payoutPeriod: period, month, year },
      orderBy: [{ driverId: 'asc' }, { date: 'asc' }, { shift: 'asc' }],
    });
    const sheetsByDriver = new Map<string, typeof allSheets>();
    for (const s of allSheets) {
      const arr = sheetsByDriver.get(s.driverId) ?? [];
      arr.push(s);
      sheetsByDriver.set(s.driverId, arr);
    }

    const drivers: PayoutDriverData[] = payouts.map((p) => {
      const sheetsRaw = sheetsByDriver.get(p.driverId) ?? [];
      const sheets: PayoutSheet[] = sheetsRaw.map((s) => ({
        date:                  s.date.toISOString(),
        shift:                 s.shift as 'MORNING' | 'EVENING',
        vehicleNumber:         s.vehicleNumber,
        grossEarnings:         s.grossEarnings,
        debitFee:              s.debitFee,
        debitTransactionCount: s.debitTransactionCount,
        hoursWorked:           s.hoursWorked,
        netDriverPay:          s.netDriverPay,
      }));
      const totalHours     = sheetsRaw.reduce((sum, s) => sum + s.hoursWorked, 0);
      const totalDebitFees = sheetsRaw.reduce((sum, s) => sum + s.debitFee * s.debitTransactionCount, 0);
      const totalAdjusted  = p.totalGross - totalDebitFees;
      return {
        driverName:     p.driver.name,
        driverPhone:    p.driver.phone || undefined,
        sheets,
        totalGross:     p.totalGross,
        totalDebitFees,
        totalAdjusted,
        totalNetPay:    p.totalNetPay,
        totalHours,
      };
    });

    const pdfBuffer = await renderPayoutPDF(drivers, period, month, year);
    const monthName = MONTHS[month - 1];
    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="Payout-All-${monthName}-P${period}-${year}.pdf"`,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
