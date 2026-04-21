/**
 * Validates findUnifiedPayouts() against live data.
 *  - shows how many rows come back for current-month + DRAFT + includeVirtual
 *  - shows which rows are real vs virtual
 *  - confirms each virtual row's totals match the sum of live daily sheets
 */
import { prisma } from '@/lib/db';
import { findUnifiedPayouts } from '@/lib/payout-virtual';

async function main() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year  = today.getFullYear();

  const rows = await findUnifiedPayouts({ month, year, status: 'DRAFT', includeVirtual: true });

  console.log(`Payouts for ${month}/${year}, status=DRAFT, includeVirtual=true → ${rows.length} rows:\n`);
  for (const r of rows) {
    const tag = r.status === 'VIRTUAL' ? '[VIRTUAL]' : `[${r.status.padEnd(5)}]`;
    console.log(`  ${tag} ${r.driver.name.padEnd(20)} P${r.payoutPeriod}  gross=${r.totalGross.toFixed(2).padStart(8)}  driverPay=${r.totalNetPay.toFixed(2).padStart(8)}`);
  }

  // Spot-check every virtual row against raw sheet sums
  let mismatches = 0;
  for (const r of rows.filter((x) => x.status === 'VIRTUAL')) {
    const sheets = await prisma.dailySheet.findMany({
      where: { driverId: r.driverId, payoutPeriod: r.payoutPeriod, month: r.month, year: r.year },
      select: { grossEarnings: true, companyNet: true },
    });
    const liveGross = sheets.reduce((s, x) => s + x.grossEarnings, 0);
    const liveNet   = sheets.reduce((s, x) => s + (x.companyNet ?? 0), 0);
    if (Math.abs(liveGross - r.totalGross) > 0.01 || Math.abs(liveNet - r.totalNetPay) > 0.01) {
      console.log(`  ⚠ MISMATCH: ${r.driver.name} P${r.payoutPeriod}  virtual=(${r.totalGross.toFixed(2)},${r.totalNetPay.toFixed(2)})  live=(${liveGross.toFixed(2)},${liveNet.toFixed(2)})`);
      mismatches++;
    }
  }
  console.log(`\nVirtual-row integrity: ${mismatches === 0 ? 'OK' : `${mismatches} mismatches`}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
