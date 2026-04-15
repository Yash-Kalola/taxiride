import { NextRequest } from 'next/server';
import { prisma } from '@/lib/db';
import { renderPayoutPDF, PayoutDriverData, PayoutSheet } from '@/lib/payout-pdf';
import { MONTHS } from '@/lib/constants';

/**
 * GET /api/payouts/[id]/pdf
 * Renders a single-driver payout statement for the 10-day period.
 */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payout = await prisma.driverPayout.findUnique({
      where: { id: params.id },
      include: { driver: { select: { name: true, phone: true } } },
    });
    if (!payout) return new Response(JSON.stringify({ error: 'Not found' }), { status: 404 });

    const sheetsRaw = await prisma.dailySheet.findMany({
      where: {
        driverId:     payout.driverId,
        payoutPeriod: payout.payoutPeriod,
        month:        payout.month,
        year:         payout.year,
      },
      orderBy: [{ date: 'asc' }, { shift: 'asc' }],
    });

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

    const totalHours      = sheetsRaw.reduce((sum, s) => sum + s.hoursWorked, 0);
    const totalDebitFees  = sheetsRaw.reduce((sum, s) => sum + s.debitFee * s.debitTransactionCount, 0);
    const totalAdjusted   = payout.totalGross - totalDebitFees;

    const driverData: PayoutDriverData = {
      driverName:     payout.driver.name,
      driverPhone:    payout.driver.phone || undefined,
      sheets,
      totalGross:     payout.totalGross,
      totalDebitFees,
      totalAdjusted,
      totalNetPay:    payout.totalNetPay,
      totalHours,
    };

    const pdfBuffer = await renderPayoutPDF(
      [driverData],
      payout.payoutPeriod as 1 | 2 | 3,
      payout.month,
      payout.year,
    );

    const safeName = payout.driver.name.replace(/[^a-zA-Z0-9]/g, '-');
    const monthName = MONTHS[payout.month - 1];
    return new Response(pdfBuffer as unknown as BodyInit, {
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="Payout-${safeName}-${monthName}-P${payout.payoutPeriod}-${payout.year}.pdf"`,
      },
    });
  } catch (err) {
    console.error(err);
    return new Response(JSON.stringify({ error: 'Server error' }), { status: 500 });
  }
}
