import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getPeriodRange } from '@/lib/driver-pay';

/**
 * POST /api/payouts/generate-all
 * Generate payout records for ALL active drivers for a given period+month+year.
 * Drivers with no daily sheets in the period still get a zeroed DRAFT record so
 * the accountant sees every driver on the report.
 */

const schema = z.object({
  payoutPeriod: z.number().int().min(1).max(3),
  month:        z.number().int().min(1).max(12),
  year:         z.number().int().min(2000).max(3000),
  activeOnly:   z.boolean().default(true),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { payoutPeriod, month, year, activeOnly } = parsed.data;
  const period = payoutPeriod as 1 | 2 | 3;
  const { start, end } = getPeriodRange(period, month, year);

  try {
    const drivers = await prisma.driver.findMany({
      where: activeOnly ? { isActive: true } : {},
      select: { id: true },
    });

    if (drivers.length === 0) {
      return NextResponse.json({ generated: 0, payouts: [] });
    }

    // Fetch all sheets for these drivers in this period in one query
    const sheets = await prisma.dailySheet.findMany({
      where: {
        driverId: { in: drivers.map((d) => d.id) },
        payoutPeriod: period, month, year,
      },
    });

    // Group sums per driver
    const sumsByDriver = new Map<string, { gross: number; deductions: number; net: number }>();
    for (const d of drivers) sumsByDriver.set(d.id, { gross: 0, deductions: 0, net: 0 });
    for (const s of sheets) {
      const cur = sumsByDriver.get(s.driverId)!;
      cur.gross      += s.grossEarnings;
      cur.net        += s.netDriverPay;
      cur.deductions += s.gasDeduction + s.debitFee * s.debitTransactionCount + s.callChargeDeduction + s.extraExpenseDeduction;
    }

    // Upsert each driver's payout in parallel inside a transaction
    const payouts = await prisma.$transaction(
      drivers.map((d) => {
        const sums = sumsByDriver.get(d.id)!;
        return prisma.driverPayout.upsert({
          where: { driverId_payoutPeriod_month_year: { driverId: d.id, payoutPeriod: period, month, year } },
          update: {
            totalGross: sums.gross,
            totalDeductions: sums.deductions,
            totalNetPay: sums.net,
            periodStart: start, periodEnd: end,
          },
          create: {
            driverId: d.id, payoutPeriod: period, month, year,
            periodStart: start, periodEnd: end,
            totalGross: sums.gross,
            totalDeductions: sums.deductions,
            totalNetPay: sums.net,
            status: 'DRAFT',
          },
        });
      })
    );

    return NextResponse.json({ generated: payouts.length, payouts });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
