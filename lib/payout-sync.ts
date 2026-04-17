/**
 * Keeps DriverPayout totals in sync with DailySheet changes.
 *
 * Call these helpers after creating / updating / deleting a DailySheet.
 *
 * Rules:
 *   - If a DRAFT payout exists for the (driverId, payoutPeriod, month, year),
 *     its stored totals are recomputed from the current sheets.
 *   - PAID payouts are NEVER touched — they're a frozen record of what the
 *     driver was actually paid. Editing sheets in a paid period doesn't
 *     retroactively rewrite history.
 *   - If no payout exists yet, nothing happens (no auto-creation).
 *
 * This keeps the Payouts list page in sync with the Driver detail page
 * without having to regenerate payouts by hand.
 */

import { prisma } from '@/lib/db';

/** Period-scoped sheet location. */
export interface PayoutScope {
  driverId:     string;
  payoutPeriod: number;
  month:        number;
  year:         number;
}

/** Recompute a single DRAFT payout's totals from its daily sheets. No-op
 *  for PAID payouts or when no payout record exists. */
export async function syncDraftPayout(scope: PayoutScope): Promise<void> {
  const payout = await prisma.driverPayout.findUnique({
    where: {
      driverId_payoutPeriod_month_year: {
        driverId:     scope.driverId,
        payoutPeriod: scope.payoutPeriod,
        month:        scope.month,
        year:         scope.year,
      },
    },
  });
  if (!payout || payout.status === 'PAID') return;

  const sheets = await prisma.dailySheet.findMany({
    where: {
      driverId:     scope.driverId,
      payoutPeriod: scope.payoutPeriod,
      month:        scope.month,
      year:         scope.year,
    },
  });

  const totalGross      = sheets.reduce((s, x) => s + x.grossEarnings, 0);
  const totalNetPay     = sheets.reduce((s, x) => s + x.netDriverPay, 0);
  const totalDeductions = totalGross - totalNetPay;

  await prisma.driverPayout.update({
    where: { id: payout.id },
    data:  { totalGross, totalNetPay, totalDeductions },
  });
}

/** Sync multiple scopes, de-duplicating first so the same (driver, period)
 *  tuple is only synced once even if several sheets touched it. */
export async function syncDraftPayouts(scopes: PayoutScope[]): Promise<void> {
  const seen = new Set<string>();
  const unique = scopes.filter((s) => {
    const key = `${s.driverId}|${s.payoutPeriod}|${s.month}|${s.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const scope of unique) {
    await syncDraftPayout(scope);
  }
}

/** Freeze a payout's totals to match current sheet values — used when
 *  transitioning DRAFT → PAID so the "what we actually paid" snapshot
 *  reflects the final state of the sheets, not the state when the payout
 *  was first generated. */
export async function freezePayoutTotals(payoutId: string): Promise<void> {
  const payout = await prisma.driverPayout.findUnique({ where: { id: payoutId } });
  if (!payout) return;

  const sheets = await prisma.dailySheet.findMany({
    where: {
      driverId:     payout.driverId,
      payoutPeriod: payout.payoutPeriod,
      month:        payout.month,
      year:         payout.year,
    },
  });

  const totalGross      = sheets.reduce((s, x) => s + x.grossEarnings, 0);
  const totalNetPay     = sheets.reduce((s, x) => s + x.netDriverPay, 0);
  const totalDeductions = totalGross - totalNetPay;

  await prisma.driverPayout.update({
    where: { id: payoutId },
    data:  { totalGross, totalNetPay, totalDeductions },
  });
}
