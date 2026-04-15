import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { COMPANY_SHARE_RATE } from '@/lib/driver-pay';

/**
 * GET /api/drivers/productivity?month=4&year=2026&activeOnly=true
 * Per-driver company P&L breakdown for the given month — mirrors the admin
 * spreadsheet: Total / 60% share / Gas / Debit / Charges / Extra / Company Net.
 *
 * Formula (see lib/driver-pay.ts):
 *   debitFeeTotal   = debitFee × count                 — off the top (100%)
 *   adjustedGross   = gross − debitFeeTotal
 *   companyShare    = adjustedGross × 60%
 *   companyNet      = companyShare − gas − callCharge − extra
 *   driverPay (40%) = adjustedGross × 40%              — view only, not P&L
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
        dailySheets: { where: { month, year } },
      },
    });

    const rows = drivers.map((d) => {
      const totalGross       = d.dailySheets.reduce((s, ds) => s + ds.grossEarnings,         0);
      const totalDebitFees   = d.dailySheets.reduce((s, ds) => s + ds.debitFee * ds.debitTransactionCount, 0);
      const totalGas         = d.dailySheets.reduce((s, ds) => s + ds.gasDeduction,          0);
      const totalCallCharge  = d.dailySheets.reduce((s, ds) => s + ds.callChargeDeduction,   0);
      const totalExtra       = d.dailySheets.reduce((s, ds) => s + ds.extraExpenseDeduction, 0);
      // Derive 60% share and company net from the stored companyNet to avoid
      // rounding drift — companyNet is already (adjusted × 0.6) − gas − call − extra.
      const totalCompanyNet  = d.dailySheets.reduce((s, ds) => s + (ds.companyNet ?? 0),     0);
      const totalCompanyShare = (totalGross - totalDebitFees) * COMPANY_SHARE_RATE;
      const sheetCount       = d.dailySheets.length;

      return {
        driverId:          d.id,
        driverName:        d.name,
        isActive:          d.isActive,
        sheetCount,
        totalGross,
        totalCompanyShare,
        totalGas,
        totalDebitFees,
        totalCallCharge,
        totalExtra,
        totalCompanyNet,
      };
    });

    return NextResponse.json({ month, year, rows });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
