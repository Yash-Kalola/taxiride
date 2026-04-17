/**
 * One-off data migration: recompute netDriverPay and companyNet on every
 * DailySheet and DriverPayout so stored values match the current formula
 * in lib/driver-pay.ts.
 *
 * Current formula:
 *   netDriverPay  = gross × 40%
 *   debitFeeTotal = debitFee − debitTransactionCount   ($1/txn subtracted)
 *   companyNet    = gross × 60% − debitFeeTotal − gas − callCharge − extra
 *
 * Both debitFee and debitTransactionCount are preserved as-is — no merging.
 *
 * What this script does to each DriverPayout:
 *   Re-aggregates totalGross / totalNetPay / totalDeductions from the
 *   now-refreshed daily sheets in the same (driver, period, month, year).
 *
 * Safe to run multiple times — a second run touches nothing once all
 * rows have correct derived values.
 *
 * Usage:
 *   npm run migrate:debit -- --dry-run    # print changes, write nothing
 *   npm run migrate:debit                 # apply changes
 */

import { PrismaClient } from '@prisma/client';
import { DRIVER_SHARE_RATE, COMPANY_SHARE_RATE } from '../lib/driver-pay';

const prisma = new PrismaClient();
const dryRun = process.argv.includes('--dry-run');

// Ignore sub-cent drift when deciding whether a row needs an update.
const EPSILON = 0.005;

function recomputeSheet(inputs: {
  grossEarnings: number;
  debitFee: number;
  debitTransactionCount: number;
  gasDeduction: number;
  callChargeDeduction: number;
  extraExpenseDeduction: number;
}): { netDriverPay: number; companyNet: number } {
  const netDriverPay   = inputs.grossEarnings * DRIVER_SHARE_RATE;
  const companyShare   = inputs.grossEarnings * COMPANY_SHARE_RATE;
  const debitFeeTotal  = Math.max(inputs.debitFee - inputs.debitTransactionCount, 0);
  const companyNet     = companyShare
    - debitFeeTotal
    - inputs.gasDeduction
    - inputs.callChargeDeduction
    - inputs.extraExpenseDeduction;
  return { netDriverPay, companyNet };
}

/** Projected post-migration values, keyed by sheet id. Used so the payout
 *  aggregation step reports correct numbers during dry runs (where sheets
 *  haven't actually been written to the DB yet). */
const projectedNetPay = new Map<string, number>();

async function migrateSheets() {
  const sheets = await prisma.dailySheet.findMany({
    orderBy: [{ year: 'asc' }, { month: 'asc' }, { date: 'asc' }],
  });

  let recomputed = 0;
  let unchanged  = 0;

  for (const s of sheets) {
    const { netDriverPay, companyNet } = recomputeSheet({
      grossEarnings:         s.grossEarnings,
      debitFee:              s.debitFee,
      debitTransactionCount: s.debitTransactionCount,
      gasDeduction:          s.gasDeduction,
      callChargeDeduction:   s.callChargeDeduction,
      extraExpenseDeduction: s.extraExpenseDeduction,
    });

    projectedNetPay.set(s.id, netDriverPay);

    const needsRecompute =
      Math.abs(s.netDriverPay - netDriverPay) > EPSILON ||
      Math.abs(s.companyNet   - companyNet)   > EPSILON;

    if (!needsRecompute) { unchanged++; continue; }
    recomputed++;

    const label = `${s.date.toISOString().slice(0, 10)} ${s.shift} cab#${s.vehicleNumber}`;
    console.log(
      `  ${label}: debit ${s.debitFee.toFixed(2)} − ${s.debitTransactionCount} txn` +
      ` = ${Math.max(s.debitFee - s.debitTransactionCount, 0).toFixed(2)}` +
      ` | driverPay ${s.netDriverPay.toFixed(2)} → ${netDriverPay.toFixed(2)}` +
      ` | companyNet ${s.companyNet.toFixed(2)} → ${companyNet.toFixed(2)}`
    );

    if (!dryRun) {
      await prisma.dailySheet.update({
        where: { id: s.id },
        data: { netDriverPay, companyNet },
      });
    }
  }

  return { total: sheets.length, recomputed, unchanged };
}

async function migratePayouts() {
  const payouts = await prisma.driverPayout.findMany({
    orderBy: [{ year: 'asc' }, { month: 'asc' }, { payoutPeriod: 'asc' }],
  });

  let updated   = 0;
  let unchanged = 0;

  for (const p of payouts) {
    const sheets = await prisma.dailySheet.findMany({
      where: {
        driverId:     p.driverId,
        payoutPeriod: p.payoutPeriod,
        month:        p.month,
        year:         p.year,
      },
    });

    // Skip payouts whose backing sheets no longer exist — don't zero them out.
    if (sheets.length === 0) { unchanged++; continue; }

    const totalGross      = sheets.reduce((s, x) => s + x.grossEarnings, 0);
    // Use the projected post-migration netDriverPay so dry-runs report
    // what totals will look like after applying, not what's in the DB now.
    const totalNetPay     = sheets.reduce(
      (s, x) => s + (projectedNetPay.get(x.id) ?? x.netDriverPay),
      0,
    );
    const totalDeductions = totalGross - totalNetPay;

    const changed =
      Math.abs(p.totalGross      - totalGross)      > EPSILON ||
      Math.abs(p.totalNetPay     - totalNetPay)     > EPSILON ||
      Math.abs(p.totalDeductions - totalDeductions) > EPSILON;

    if (!changed) { unchanged++; continue; }
    updated++;

    console.log(
      `  payout ${p.id.slice(0, 8)} (period ${p.payoutPeriod}, ${p.month}/${p.year}):` +
      ` gross ${p.totalGross.toFixed(2)} → ${totalGross.toFixed(2)},` +
      ` net ${p.totalNetPay.toFixed(2)} → ${totalNetPay.toFixed(2)}`
    );

    if (!dryRun) {
      await prisma.driverPayout.update({
        where: { id: p.id },
        data: { totalGross, totalNetPay, totalDeductions },
      });
    }
  }

  return { total: payouts.length, updated, unchanged };
}

async function main() {
  console.log(
    `\n${dryRun ? '[DRY RUN]' : '[APPLY]'} ` +
    `Recomputing derived values with formula: debitFeeTotal = amount − txnCount\n`
  );

  console.log('▸ Daily sheets');
  const sheetStats = await migrateSheets();
  console.log(
    `  ${sheetStats.total} total · ` +
    `${sheetStats.recomputed} recomputed · ` +
    `${sheetStats.unchanged} already correct\n`
  );

  console.log('▸ Driver payouts');
  const payoutStats = await migratePayouts();
  console.log(
    `  ${payoutStats.total} total · ` +
    `${payoutStats.updated} updated · ` +
    `${payoutStats.unchanged} already correct\n`
  );

  console.log(dryRun
    ? 'Dry run complete — no data changed. Re-run without --dry-run to apply.'
    : 'Migration complete.'
  );
}

main()
  .then(async () => { await prisma.$disconnect(); })
  .catch(async (err) => {
    console.error('\nMigration failed:', err);
    await prisma.$disconnect();
    process.exit(1);
  });
