import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { renderYearlyPDF, type YearlyRow } from '@/lib/dashboard-pdf';

/**
 * GET /api/dashboard/yearly-pdf?year=2026
 * Returns a PDF of the 12-month YTD P&L table.
 */
export async function GET(request: NextRequest) {
  const url  = new URL(request.url);
  const year = parseInt(url.searchParams.get('year') ?? '0');
  if (!year) return NextResponse.json({ error: 'year is required' }, { status: 400 });

  try {
    const companyCars = await prisma.brokerVehicle.findMany({
      where: { isCompanyCar: true },
      select: { cabNumber: true },
    });
    const cabs = companyCars.map((v) => v.cabNumber);

    const yearStart = new Date(year, 0, 1);
    const yearEnd   = new Date(year + 1, 0, 1);
    const [sheets, expenses, brokerExps] = await Promise.all([
      cabs.length > 0
        ? prisma.dailySheet.findMany({
            where:  { vehicleNumber: { in: cabs }, year },
            select: {
              month: true, grossEarnings: true, netDriverPay: true,
              gasDeduction: true, extraExpenseDeduction: true,
            },
          })
        : Promise.resolve([] as any[]),
      prisma.companyExpense.findMany({
        where:  { year },
        select: { month: true, amount: true, vehicleNumber: true },
      }),
      cabs.length > 0
        ? prisma.brokerExpense.findMany({
            where:  { cabNumber: { in: cabs }, date: { gte: yearStart, lt: yearEnd } },
            select: { cabNumber: true, amount: true, date: true },
          })
        : Promise.resolve([] as { cabNumber: string; amount: number; date: Date }[]),
    ]);

    const rows: YearlyRow[] = Array.from({ length: 12 }, (_, i) => i + 1).map((m) => {
      const ss = sheets.filter((s) => s.month === m);
      const xs = expenses.filter((x) => x.month === m);
      const bx = brokerExps.filter((e) => new Date(e.date).getMonth() + 1 === m);
      const gross         = ss.reduce((a, s) => a + s.grossEarnings,         0);
      const driverPay     = ss.reduce((a, s) => a + s.netDriverPay,          0);
      const gas           = ss.reduce((a, s) => a + s.gasDeduction,          0);
      const extra         = ss.reduce((a, s) => a + s.extraExpenseDeduction, 0);
      const perVehicleExp = xs.filter((x) => x.vehicleNumber).reduce((a, x) => a + x.amount, 0)
                          + bx.reduce((a, e) => a + e.amount, 0);
      const otherExp      = xs.filter((x) => !x.vehicleNumber).reduce((a, x) => a + x.amount, 0);
      const vehicleP      = gross - driverPay - gas - extra - perVehicleExp;
      return {
        month:           m,
        revenue:         gross,
        carExpenses:     gas + extra + perVehicleExp,
        companyExpenses: otherExp,
        profit:          vehicleP - otherExp,
      };
    });

    const curMonth = new Date().getMonth() + 1;
    const pdf = await renderYearlyPDF({ year, curMonth, rows });
    return new NextResponse(new Uint8Array(pdf), {
      status: 200,
      headers: {
        'Content-Type':        'application/pdf',
        'Content-Disposition': `inline; filename="YTD-${year}.pdf"`,
      },
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
