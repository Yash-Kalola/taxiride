import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { getPeriodRange } from '@/lib/driver-pay';
import { findUnifiedPayouts } from '@/lib/payout-virtual';

/**
 * GET  /api/payouts?month=4&year=2026&period=1&status=DRAFT&includeVirtual=1
 *      — list payouts; when includeVirtual=1 + month + year, active drivers
 *      without a payout row also appear with live totals (status="VIRTUAL").
 * POST /api/payouts  { driverId, payoutPeriod, month, year } — generate for ONE driver
 */

const generateSchema = z.object({
  driverId:     z.string().min(1),
  payoutPeriod: z.number().int().min(1).max(3),
  month:        z.number().int().min(1).max(12),
  year:         z.number().int().min(2000).max(3000),
  notes:        z.string().optional(),
});

export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const month          = url.searchParams.get('month');
  const year           = url.searchParams.get('year');
  const period         = url.searchParams.get('period');
  const status         = url.searchParams.get('status');
  const driverId       = url.searchParams.get('driverId');
  const includeVirtual = url.searchParams.get('includeVirtual') === '1';

  try {
    const rows = await findUnifiedPayouts({
      month:          month  ? parseInt(month)  : undefined,
      year:           year   ? parseInt(year)   : undefined,
      period:         period ? (parseInt(period) as 1 | 2 | 3) : undefined,
      status:         status === 'DRAFT' || status === 'PAID' ? status : undefined,
      driverId:       driverId ?? undefined,
      includeVirtual,
    });
    return NextResponse.json(rows);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = generateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { driverId, payoutPeriod, month, year, notes } = parsed.data;
  const period = payoutPeriod as 1 | 2 | 3;
  const { start, end } = getPeriodRange(period, month, year);

  try {
    const driver = await prisma.driver.findUnique({ where: { id: driverId } });
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    // Sum daily sheets for this driver in this period
    const sheets = await prisma.dailySheet.findMany({
      where: { driverId, payoutPeriod, month, year },
    });

    const totalGross      = sheets.reduce((s, x) => s + x.grossEarnings,      0);
    // Driver pay is the settlement amount per shift (gross × 60% − expenses),
    // summed across the 10-day period. Can be negative (company owes driver)
    // or positive (driver owes company) — client-specified business model.
    const totalNetPay     = sheets.reduce((s, x) => s + (x.companyNet ?? 0),   0);
    const totalDeductions = totalGross - totalNetPay;

    // Upsert on unique (driverId, payoutPeriod, month, year)
    const payout = await prisma.driverPayout.upsert({
      where: {
        driverId_payoutPeriod_month_year: { driverId, payoutPeriod: period, month, year },
      },
      update: {
        totalGross, totalDeductions, totalNetPay,
        periodStart: start, periodEnd: end,
        ...(notes !== undefined ? { notes } : {}),
      },
      create: {
        driverId, payoutPeriod: period, month, year,
        periodStart: start, periodEnd: end,
        totalGross, totalDeductions, totalNetPay,
        status: 'DRAFT',
        notes: notes ?? '',
      },
    });

    return NextResponse.json(payout, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
