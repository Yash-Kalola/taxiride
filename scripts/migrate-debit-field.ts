/**
 * One-off data migration: recompute netDriverPay + companyNet on every
 * DailySheet, recompute totalGross / totalNetPay / totalDeductions on
 * every DriverPayout, AND reopen any PAID payout whose period no longer
 * matches its frozen snapshot (pending sheet, or totals drifted).
 * This brings stored values in line with the current business model.
 *
 * Current business model (see lib/driver-pay.ts):
 *   Per-sheet:
 *     netDriverPay  = gross × 40%                         (reference only)
 *     debitFeeTotal = debitFee − debitTransactionCount    ($1/txn subtracted)
 *     companyNet    = gross × 60% − debitFeeTotal − gas − call − extra
 *     driver pay per shift = companyNet    (can be negative or positive)
 *
 *   Per DriverPayout (10-day aggregate):
 *     totalGross      = sum(sheet.grossEarnings)
 *     totalNetPay     = sum(sheet.companyNet)    ← the driver pay total
 *     totalDeductions = totalGross − totalNetPay
 *
 * Both debitFee and debitTransactionCount are preserved as-is — no merging.
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

/** Projected post-migration per-shift driver pay (= companyNet), keyed by
 *  sheet id. Used so the payout aggregation step reports correct numbers
 *  during dry runs (where sheets haven't actually been written to the DB
 *  yet). */
const projectedDriverPay = new Map<string, number>();

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

    projectedDriverPay.set(s.id, companyNet);

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
  let reopened  = 0;
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
    // totalNetPay is now the summed PER-SHIFT driver pay, where each shift's
    // driver pay = companyNet (gross × 60% − expenses). Can be negative.
    // Use projected value in dry-run so the aggregate reflects what the
    // sheet WILL be after the migration writes.
    const totalNetPay     = sheets.reduce(
      (s, x) => s + (projectedDriverPay.get(x.id) ?? (x.companyNet ?? 0)),
      0,
    );
    const totalDeductions = totalGross - totalNetPay;

    const totalsChanged =
      Math.abs(p.totalGross      - totalGross)      > EPSILON ||
      Math.abs(p.totalNetPay     - totalNetPay)     > EPSILON ||
      Math.abs(p.totalDeductions - totalDeductions) > EPSILON;

    // A PAID payout with any pending sheet OR a stale total should reopen.
    // This matches lib/payout-sync.ts: the stored snapshot only holds while
    // the period's state actually matches what was paid.
    const anyPendingSheet = sheets.some((x) => !x.isPaid);
    const shouldReopen = p.status === 'PAID' && (anyPendingSheet || totalsChanged);

    if (!totalsChanged && !shouldReopen) { unchanged++; continue; }

    const label = `  payout ${p.id.slice(0, 8)} (period ${p.payoutPeriod}, ${p.month}/${p.year})`;

    if (shouldReopen) {
      reopened++;
      console.log(
        `${label}: REOPEN (status PAID → DRAFT)` +
        (anyPendingSheet ? ` — has ${sheets.filter((x) => !x.isPaid).length} pending sheet(s)` : '') +
        (totalsChanged ? ` — totals drifted` : '')
      );
    } else {
      updated++;
      console.log(
        `${label}: gross ${p.totalGross.toFixed(2)} → ${totalGross.toFixed(2)},` +
        ` net ${p.totalNetPay.toFixed(2)} → ${totalNetPay.toFixed(2)}`
      );
    }

    if (!dryRun) {
      await prisma.driverPayout.update({
        where: { id: p.id },
        data: {
          totalGross, totalNetPay, totalDeductions,
          ...(shouldReopen ? { status: 'DRAFT', paidDate: null } : {}),
        },
      });
    }
  }

  return { total: payouts.length, updated, reopened, unchanged };
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
    `${payoutStats.updated} totals updated · ` +
    `${payoutStats.reopened} reopened (PAID→Unpaid) · ` +
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
