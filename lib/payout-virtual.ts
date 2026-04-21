/**
 * "Virtual payout rows" — synthetic entries for active drivers who have
 * daily-sheet activity in a (period, month, year) window but no persisted
 * DriverPayout record yet. The Payouts page merges these with real payouts
 * so every active driver shows up with live totals, without requiring the
 * user to click "Generate All" first.
 *
 * Virtual rows carry `id: null` and `status: 'VIRTUAL'`. Clients that try
 * to act on them (Mark Paid, PDF, etc.) materialize the underlying DB row
 * first via POST /api/payouts.
 */

import { prisma } from '@/lib/db';
import { getPeriodRange } from '@/lib/driver-pay';

export interface UnifiedPayoutRow {
  id:              string | null;            // null => virtual
  driverId:        string;
  driver:          { id: string; name: string };
  payoutPeriod:    number;
  month:           number;
  year:            number;
  periodStart:     string;
  periodEnd:       string;
  totalGross:      number;
  totalDeductions: number;
  totalNetPay:     number;
  status:          'DRAFT' | 'PAID' | 'VIRTUAL';
  paidDate:        string | null;
}

export interface UnifiedQuery {
  month?:          number;     // if undefined, DB-only mode (no virtual rows)
  year?:           number;
  period?:         1 | 2 | 3;  // if undefined, consider all three
  status?:         'DRAFT' | 'PAID'; // client filter — 'PAID' suppresses virtual rows
  driverId?:       string;
  includeVirtual?: boolean;    // defaults to false; set to include synthetic rows
}

/**
 * Returns real DriverPayout rows for the query, plus virtual rows for
 * active drivers who have sheets in scope but no payout record. Virtual
 * rows are omitted when status filter is 'PAID'.
 */
export async function findUnifiedPayouts(q: UnifiedQuery): Promise<UnifiedPayoutRow[]> {
  // --- Real rows ---
  const realWhere: Record<string, unknown> = {};
  if (q.month    !== undefined) realWhere.month        = q.month;
  if (q.year     !== undefined) realWhere.year         = q.year;
  if (q.period   !== undefined) realWhere.payoutPeriod = q.period;
  if (q.status)                 realWhere.status       = q.status;
  if (q.driverId)               realWhere.driverId     = q.driverId;

  const realRows = await prisma.driverPayout.findMany({
    where:   realWhere,
    orderBy: [{ year: 'desc' }, { month: 'desc' }, { payoutPeriod: 'desc' }, { createdAt: 'desc' }],
    include: { driver: { select: { id: true, name: true } } },
  });

  const mapped: UnifiedPayoutRow[] = realRows.map((r) => ({
    id:              r.id,
    driverId:        r.driverId,
    driver:          { id: r.driver.id, name: r.driver.name },
    payoutPeriod:    r.payoutPeriod,
    month:           r.month,
    year:            r.year,
    periodStart:     r.periodStart.toISOString(),
    periodEnd:       r.periodEnd.toISOString(),
    totalGross:      r.totalGross,
    totalDeductions: r.totalDeductions,
    totalNetPay:     r.totalNetPay,
    status:          r.status as 'DRAFT' | 'PAID',
    paidDate:        r.paidDate ? r.paidDate.toISOString() : null,
  }));

  // Virtual rows only make sense for a specific (month, year). Also skip
  // when client is filtering to PAID only — those cannot exist virtually.
  if (!q.includeVirtual || q.month === undefined || q.year === undefined || q.status === 'PAID') {
    return mapped;
  }

  const periods: (1 | 2 | 3)[] = q.period ? [q.period] : [1, 2, 3];

  // Active drivers in scope (honor driverId filter if present).
  const activeDrivers = await prisma.driver.findMany({
    where:   { isActive: true, ...(q.driverId ? { id: q.driverId } : {}) },
    select:  { id: true, name: true },
    orderBy: { name: 'asc' },
  });
  if (activeDrivers.length === 0) return mapped;
  const driverIds = activeDrivers.map((d) => d.id);

  // Pull every sheet in scope in one query, then group in memory.
  const sheets = await prisma.dailySheet.findMany({
    where: {
      driverId:     { in: driverIds },
      month:        q.month,
      year:         q.year,
      payoutPeriod: { in: periods },
    },
    select: { driverId: true, payoutPeriod: true, grossEarnings: true, companyNet: true },
  });

  // Key: `${driverId}|${period}` → running totals
  const sums = new Map<string, { gross: number; net: number }>();
  for (const s of sheets) {
    const key = `${s.driverId}|${s.payoutPeriod}`;
    const cur = sums.get(key) ?? { gross: 0, net: 0 };
    cur.gross += s.grossEarnings;
    cur.net   += s.companyNet ?? 0;
    sums.set(key, cur);
  }

  // Existing real rows as a set so we don't double-count.
  const realKeys = new Set(realRows.map((r) => `${r.driverId}|${r.payoutPeriod}|${r.month}|${r.year}`));

  const virtualRows: UnifiedPayoutRow[] = [];
  for (const d of activeDrivers) {
    for (const p of periods) {
      const key        = `${d.id}|${p}`;
      const uniqueKey  = `${d.id}|${p}|${q.month}|${q.year}`;
      if (realKeys.has(uniqueKey)) continue; // already has a real row

      const sum = sums.get(key);
      const hasSheets = !!sum && (sum.gross !== 0 || sum.net !== 0);
      // Only surface virtual rows for drivers with live activity in scope.
      // "Generate All" still handles zero-activity rows for drivers who need
      // an explicit $0 record (e.g. payroll confirmation for an idle period).
      if (!hasSheets) continue;

      const { start, end } = getPeriodRange(p, q.month, q.year);
      const gross = sum?.gross ?? 0;
      const net   = sum?.net   ?? 0;
      virtualRows.push({
        id:              null,
        driverId:        d.id,
        driver:          { id: d.id, name: d.name },
        payoutPeriod:    p,
        month:           q.month,
        year:            q.year,
        periodStart:     start.toISOString(),
        periodEnd:       end.toISOString(),
        totalGross:      gross,
        totalDeductions: gross - net,
        totalNetPay:     net,
        status:          'VIRTUAL',
        paidDate:        null,
      });
    }
  }

  // Merge + sort: newest period first, then driver name
  return [...mapped, ...virtualRows].sort((a, b) => {
    if (a.year !== b.year) return b.year - a.year;
    if (a.month !== b.month) return b.month - a.month;
    if (a.payoutPeriod !== b.payoutPeriod) return b.payoutPeriod - a.payoutPeriod;
    return a.driver.name.localeCompare(b.driver.name);
  });
}
