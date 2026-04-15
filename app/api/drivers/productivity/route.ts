import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { computeProductivity } from '@/lib/driver-pay';

/**
 * GET /api/drivers/productivity?month=4&year=2026&activeOnly=true
 * Aggregate productivity across drivers for a given month.
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const month      = parseInt(url.searchParams.get('month') || String(new Date().getMonth() + 1));
  const year       = parseInt(url.searchParams.get('year')  || String(new Date().getFullYear()));
  const activeOnly = url.searchParams.get('activeOnly') !== 'false';

  try {
    const drivers = await prisma.driver.findMany({
      where: activeOnly ? { isActive: true } : {},
      orderBy: { name: 'asc' },
      include: {
        assignments: { where: { isActive: true }, orderBy: { startDate: 'desc' }, take: 1 },
        dailySheets: { where: { month, year } },
      },
    });

    const rows = drivers.map((d) => {
      const totalGross      = d.dailySheets.reduce((s, ds) => s + ds.grossEarnings, 0);
      const totalNetPay     = d.dailySheets.reduce((s, ds) => s + ds.netDriverPay, 0);
      const totalHours      = d.dailySheets.reduce((s, ds) => s + ds.hoursWorked, 0);
      const totalDeductions = d.dailySheets.reduce((s, ds) =>
        s + ds.gasDeduction + ds.debitFee * ds.debitTransactionCount + ds.callChargeDeduction + ds.extraExpenseDeduction, 0);
      const sheetCount      = d.dailySheets.length;
      const productivity    = computeProductivity(totalNetPay, totalHours);
      const current         = d.assignments[0] ?? null;

      return {
        driverId:         d.id,
        driverName:       d.name,
        isActive:         d.isActive,
        currentVehicle:   current?.vehicleNumber ?? null,
        currentShift:     current?.shift ?? null,
        sheetCount,
        totalGross,
        totalDeductions,
        totalNetPay,
        totalHours,
        productivity,     // null if hours=0
      };
    });

    return NextResponse.json({ month, year, rows });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
