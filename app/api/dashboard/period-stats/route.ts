import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/dashboard/period-stats?month=4&year=2026
 *   — Company P&L (Vehicle/Broker/Other/Total) + Per-Vehicle breakdown
 *     for the requested month/year. Both month and year are required; this
 *     endpoint is always per-month (unlike the brokers endpoint).
 *
 * Response: { pl: { vehicleProfit, brokerProfit, otherExpense, totalProfit, brokerCount }, perVehicle: VehicleStats[] }
 */

export interface VehicleStats {
  cabNumber: string;
  gross:     number;
  driverPay: number;
  gas:       number;
  extra:     number;
  repairs:   number;
  profit:    number;
}

export async function GET(request: NextRequest) {
  const url   = new URL(request.url);
  const month = parseInt(url.searchParams.get('month') || '');
  const year  = parseInt(url.searchParams.get('year')  || '');
  if (!month || !year) {
    return NextResponse.json({ error: 'month and year required' }, { status: 400 });
  }

  try {
    const companyCars = await prisma.brokerVehicle
      .findMany({ where: { isCompanyCar: true }, select: { cabNumber: true } })
      .catch(() => [] as { cabNumber: string }[]);
    const companyCabNumbers = companyCars.map((v) => v.cabNumber);

    const [sheets, companyExpenses, brokerTxs, brokerExpenses] = await Promise.all([
      companyCabNumbers.length > 0
        ? prisma.dailySheet.findMany({
            where: { vehicleNumber: { in: companyCabNumbers }, month, year },
            select: {
              vehicleNumber: true, grossEarnings: true, netDriverPay: true,
              gasDeduction: true, extraExpenseDeduction: true,
            },
          })
        : Promise.resolve([] as any[]),
      prisma.companyExpense.findMany({
        where: { month, year },
        select: { amount: true, vehicleNumber: true },
      }).catch(() => [] as { amount: number; vehicleNumber: string }[]),
      prisma.brokerTransaction.findMany({
        where:  { status: { not: 'VOID' }, month, year },
        select: { amount: true, type: true, status: true, brokerId: true },
      }).catch(() => [] as { amount: number; type: string; status: string; brokerId: string }[]),
      prisma.brokerExpense.findMany({
        where: {
          date: { gte: new Date(year, month - 1, 1), lt: new Date(year, month, 1) },
        },
        select: { amount: true, paid: true, cabNumber: true, brokerId: true },
      }).catch(() => [] as { amount: number; paid: boolean; cabNumber: string; brokerId: string }[]),
    ]);

    // --- Per-vehicle breakdown ---
    const perVehicle: VehicleStats[] = companyCabNumbers.map((cab) => {
      const cabSheets  = sheets.filter((s) => s.vehicleNumber === cab);
      const repairs =
        companyExpenses.filter((r) => r.vehicleNumber === cab).reduce((a, r) => a + r.amount, 0) +
        brokerExpenses.filter((e) => e.cabNumber === cab).reduce((a, e) => a + e.amount, 0);
      const gross     = cabSheets.reduce((a, s) => a + s.grossEarnings,         0);
      const driverPay = cabSheets.reduce((a, s) => a + s.netDriverPay,          0);
      const gas       = cabSheets.reduce((a, s) => a + s.gasDeduction,          0);
      const extra     = cabSheets.reduce((a, s) => a + s.extraExpenseDeduction, 0);
      return {
        cabNumber: cab,
        gross, driverPay, gas, extra, repairs,
        profit: gross - driverPay - gas - extra - repairs,
      };
    }).sort((a, b) => b.profit - a.profit);

    const vehicleProfit = perVehicle.reduce((a, v) => a + v.profit, 0);

    // --- Broker Profit (same formula as dashboard page) ---
    const brokerIds = new Set<string>();
    let brokerIncome = 0;
    let brokerOutflow = 0;
    for (const t of brokerTxs) {
      brokerIds.add(t.brokerId);
      if (t.type === 'PAYOUT') brokerOutflow += t.amount;
      else                     brokerIncome  += t.amount;
    }
    for (const e of brokerExpenses) {
      brokerIds.add(e.brokerId);
      brokerIncome += e.amount;
    }
    const brokerProfit = brokerIncome - brokerOutflow;

    // --- Other Expense (untagged CompanyExpense for the period) ---
    const otherExpense = companyExpenses
      .filter((x) => !x.vehicleNumber)
      .reduce((a, x) => a + x.amount, 0);

    const totalProfit = vehicleProfit + brokerProfit - otherExpense;

    return NextResponse.json({
      pl: {
        vehicleProfit, brokerProfit, otherExpense, totalProfit,
        brokerCount: brokerIds.size,
        vehicleCount: perVehicle.length,
      },
      perVehicle,
    });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
