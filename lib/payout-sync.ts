/**
 * Keeps DriverPayout totals (and status) in sync with DailySheet changes.
 *
 * Call these helpers after creating / updating / deleting a DailySheet, or
 * after bulk-flipping isPaid on sheets.
 *
 * Rules:
 *   - If no payout exists for the (driverId, period, month, year), nothing
 *     happens (we don't auto-create payouts).
 *   - If the payout is DRAFT, its stored totals are recomputed from the
 *     current sheets.
 *   - If the payout is PAID and the period has either (a) a pending sheet
 *     or (b) a stored total that no longer matches the live sum, it gets
 *     REOPENED to DRAFT and the totals are refreshed. Rationale: the driver
 *     has been paid the frozen amount, but there's new/changed activity the
 *     owner needs to process — surfacing it in the Unpaid filter makes that
 *     obvious.
 *   - If the payout is PAID and nothing has changed, it's left alone (the
 *     frozen snapshot is preserved).
 */

import { prisma } from '@/lib/db';

const EPSILON = 0.005; // sub-cent drift tolerance

/** Period-scoped sheet location. */
export interface PayoutScope {
  driverId:     string;
  payoutPeriod: number;
  month:        number;
  year:         number;
}

/** Reconcile a single payout against its current sheets. See header for
 *  the exact rules. No-op if the payout doesn't exist. */
export async function syncPayout(scope: PayoutScope): Promise<void> {
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
  if (!payout) return;

  const sheets = await prisma.dailySheet.findMany({
    where: {
      driverId:     scope.driverId,
      payoutPeriod: scope.payoutPeriod,
      month:        scope.month,
      year:         scope.year,
    },
  });

  const totalGross      = sheets.reduce((s, x) => s + x.grossEarnings,     0);
  // Driver pay is the SETTLEMENT amount — summed per-shift company net,
  // which is (gross × 60% − debit − gas − call − extra) per sheet.
  // Negative total → company pays driver. Positive total → driver pays company.
  const totalNetPay     = sheets.reduce((s, x) => s + (x.companyNet ?? 0), 0);
  const totalDeductions = totalGross - totalNetPay;

  if (payout.status === 'DRAFT') {
    await prisma.driverPayout.update({
      where: { id: payout.id },
      data:  { totalGross, totalNetPay, totalDeductions },
    });
    return;
  }

  // Payout is PAID — only touch it if the period has drifted from the
  // frozen snapshot. That means either a sheet is now pending (isPaid=false)
  // or the recomputed total no longer matches stored.
  const anyPendingSheet = sheets.some((x) => !x.isPaid);
  const totalsChanged   =
    Math.abs(payout.totalGross  - totalGross)  > EPSILON ||
    Math.abs(payout.totalNetPay - totalNetPay) > EPSILON;

  if (anyPendingSheet || totalsChanged) {
    await prisma.driverPayout.update({
      where: { id: payout.id },
      data:  {
        status:   'DRAFT',
        paidDate: null,
        totalGross, totalNetPay, totalDeductions,
      },
    });
  }
  // else: PAID, nothing changed — leave the frozen snapshot alone.
}

/** Sync multiple scopes, de-duplicating first so the same (driver, period)
 *  tuple is only synced once even if several sheets touched it. */
export async function syncPayouts(scopes: PayoutScope[]): Promise<void> {
  const seen = new Set<string>();
  const unique = scopes.filter((s) => {
    const key = `${s.driverId}|${s.payoutPeriod}|${s.month}|${s.year}`;
    if (seen.has(key)) return false;
    seen.add(key);
    return true;
  });
  for (const scope of unique) {
    await syncPayout(scope);
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

  const totalGross      = sheets.reduce((s, x) => s + x.grossEarnings,     0);
  const totalNetPay     = sheets.reduce((s, x) => s + (x.companyNet ?? 0), 0);
  const totalDeductions = totalGross - totalNetPay;

  await prisma.driverPayout.update({
    where: { id: payoutId },
    data:  { totalGross, totalNetPay, totalDeductions },
  });
}
