/**
 * Read-only diagnostic. Prints, for the CURRENT month, per-driver + per-period:
 *   - whether a DriverPayout row exists
 *   - live sum(companyNet) for that scope
 *   - live sum(netDriverPay) for that scope (the OLD/wrong "driver pay" field)
 *   - stored totalNetPay on the DriverPayout row
 *   - drift = storedTotalNetPay − liveCompanyNetSum
 *
 * If Yash sees "not synchronized" rows, drift should be non-zero and likely
 * equal to sum(netDriverPay) − sum(companyNet), meaning those rows were
 * generated via /api/payouts/generate-all (which still reads netDriverPay).
 */
import { prisma } from '@/lib/db';

async function main() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year  = today.getFullYear();
  console.log(`Inspecting payouts for ${month}/${year}\n`);

  const drivers = await prisma.driver.findMany({
    where: { isActive: true },
    select: { id: true, name: true },
    orderBy: { name: 'asc' },
  });

  const EPSILON = 0.01;
  const rows: {
    name: string; period: number; hasPayout: boolean;
    liveCompanyNet: number; liveNetDriverPay: number;
    storedNet: number | null; drift: number | null;
    status: string | null;
  }[] = [];

  for (const d of drivers) {
    for (const period of [1, 2, 3] as const) {
      const [sheets, payout] = await Promise.all([
        prisma.dailySheet.findMany({
          where: { driverId: d.id, payoutPeriod: period, month, year },
          select: { companyNet: true, netDriverPay: true },
        }),
        prisma.driverPayout.findUnique({
          where: {
            driverId_payoutPeriod_month_year: {
              driverId: d.id, payoutPeriod: period, month, year,
            },
          },
        }),
      ]);
      if (sheets.length === 0 && !payout) continue;

      const liveCompanyNet   = sheets.reduce((s, x) => s + (x.companyNet   ?? 0), 0);
      const liveNetDriverPay = sheets.reduce((s, x) => s + (x.netDriverPay ?? 0), 0);
      const storedNet = payout?.totalNetPay ?? null;
      const drift     = payout ? payout.totalNetPay - liveCompanyNet : null;

      rows.push({
        name: d.name, period,
        hasPayout: !!payout,
        liveCompanyNet, liveNetDriverPay,
        storedNet, drift,
        status: payout?.status ?? null,
      });
    }
  }

  // Show everything — caller can eyeball which are drifted
  console.log('Driver                            P  Payout? Status  LiveCompanyNet   LiveNetDriverPay StoredNet        Drift');
  console.log('--------------------------------- -- ------- ------- ---------------- ---------------- ---------------- ----------------');
  for (const r of rows) {
    const f = (n: number | null) => n === null ? '      — ' : n.toFixed(2).padStart(16, ' ');
    const drifted = r.drift !== null && Math.abs(r.drift) > EPSILON ? ' ⚠' : '';
    console.log(
      `${r.name.padEnd(33).slice(0, 33)} ${String(r.period).padStart(2)} ${(r.hasPayout ? 'Yes' : 'No').padEnd(7)} ${(r.status ?? '—').padEnd(7)} ${f(r.liveCompanyNet)} ${f(r.liveNetDriverPay)} ${f(r.storedNet)} ${f(r.drift)}${drifted}`
    );
  }

  // Summary: active drivers missing a payout for any period that has sheets
  const missing = rows.filter((r) => !r.hasPayout && (r.liveCompanyNet !== 0 || r.liveNetDriverPay !== 0));
  const drifted = rows.filter((r) => r.drift !== null && Math.abs(r.drift) > EPSILON);
  console.log(`\nSummary: ${missing.length} driver-periods with sheets but no payout row, ${drifted.length} drifted payouts.`);
  if (drifted.length > 0) {
    console.log('Drifted rows (stored totalNetPay ≠ live sum(companyNet)):');
    for (const r of drifted) {
      console.log(`  • ${r.name}  P${r.period}  stored=${r.storedNet?.toFixed(2)}  live=${r.liveCompanyNet.toFixed(2)}  diff=${r.drift?.toFixed(2)}`);
    }
  }
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
