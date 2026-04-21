import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renderPerVehiclePDF, type PerVehicleRow } from '@/lib/dashboard-pdf';
import { MONTHS } from '@/lib/constants';

/**
 * GET /api/dashboard/per-vehicle-pdf?month=4&year=2026
 * Returns a PDF of the per-vehicle P&L table for the given month.
 */
export async function GET(request: NextRequest) {
  const url   = new URL(request.url);
  const month = parseInt(url.searchParams.get('month') ?? '0');
  const year  = parseInt(url.searchParams.get('year')  ?? '0');
  if (!month || !year) return NextResponse.json({ error: 'month and year are required' }, { status: 400 });
  if (month < 1 || month > 12) return NextResponse.json({ error: 'month must be 1-12' }, { status: 400 });

  try {
    const companyCars = await prisma.brokerVehicle.findMany({
      where:  { isCompanyCar: true },
      select: { cabNumber: true },
    });
    const companyCabNumbers = companyCars.map((v) => v.cabNumber);
    if (companyCabNumbers.length === 0) {
      const empty = await renderPerVehiclePDF({ month, year, rows: [] });
      return new NextResponse(new Uint8Array(empty), {
        status: 200,
        headers: {
          'Content-Type':        'application/pdf',
          'Content-Disposition': `inline; filename="Per-Vehicle-${MONTHS[month - 1]}-${year}.pdf"`,
        },
      });
    }

    const monthStart = new Date(year, month - 1, 1);
    const monthEnd   = new Date(year, month, 1);
    const [sheets, companyExp, brokerExp] = await Promise.all([
      prisma.dailySheet.findMany({
        where: { vehicleNumber: { in: companyCabNumbers }, month, year },
        select: {
          vehicleNumber: true, grossEarnings: true, netDriverPay: true,
          gasDeduction: true, extraExpenseDeduction: true,
        },
      }),
      prisma.companyExpense.findMany({
        where:  { vehicleNumber: { in: companyCabNumbers }, month, year },
        select: { vehicleNumber: true, amount: true },
      }),
      prisma.brokerExpense.findMany({
        where:  { cabNumber: { in: companyCabNumbers }, date: { gte: monthStart, lt: monthEnd } },
        select: { cabNumber: true, amount: true },
      }),
    ]);

    const rows: PerVehicleRow[] = companyCabNumbers.map((cab) => {
      const ss = sheets.filter((s) => s.vehicleNumber === cab);
      const gross     = ss.reduce((a, s) => a + s.grossEarnings,         0);
      const driverPay = ss.reduce((a, s) => a + s.netDriverPay,          0);
      const gas       = ss.reduce((a, s) => a + s.gasDeduction,          0);
      const extra     = ss.reduce((a, s) => a + s.extraExpenseDeduction, 0);
      const repair    = companyExp.filter((r) => r.vehicleNumber === cab).reduce((a, r) => a + r.amount, 0)
                      + brokerExp.filter((e) => e.cabNumber    === cab).reduce((a, e) => a + e.amount, 0);
      return {
        cabNumber: cab,
        gross, driverPay, gas, extra, repairs: repair,
        profit: gross - driverPay - gas - extra - repair,
      };
    }).sort((a, b) => b.profit - a.profit);

    const pdf = await renderPerVehiclePDF({ month, year, rows });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="Per-Vehicle-${MONTHS[month - 1]}-${year}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
