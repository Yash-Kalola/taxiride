/**
 * Driver pay calculation helpers.
 *
 * Business rules (from Phase 3 spec):
 *   • Driver earns 60% of gross earnings for their shift
 *   • From that 60%, deduct gas, debit fees (debitFee × count), call charges, extra expenses
 *   • netDriverPay can go negative — do NOT clamp to zero
 *   • Payout period is derived from the day-of-month:
 *        day 1–10  = period 1
 *        day 11–20 = period 2
 *        day 21–   = period 3
 */

export const DRIVER_SHARE = 0.60;

export interface NetPayInputs {
  grossEarnings: number;
  gasDeduction: number;
  debitFee: number;
  debitTransactionCount: number;
  callChargeDeduction: number;
  extraExpenseDeduction: number;
}

/** Compute net driver pay. May be negative. Non-finite inputs treated as 0. */
export function computeNetDriverPay(inputs: NetPayInputs): number {
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  const gross   = n(inputs.grossEarnings);
  const gas     = n(inputs.gasDeduction);
  const debit   = n(inputs.debitFee) * n(inputs.debitTransactionCount);
  const call    = n(inputs.callChargeDeduction);
  const extra   = n(inputs.extraExpenseDeduction);
  return gross * DRIVER_SHARE - gas - debit - call - extra;
}

/** Sum of all deductions (everything subtracted from the 60% share). */
export function computeTotalDeductions(inputs: NetPayInputs): number {
  const n = (v: number) => (Number.isFinite(v) ? v : 0);
  return n(inputs.gasDeduction)
    + n(inputs.debitFee) * n(inputs.debitTransactionCount)
    + n(inputs.callChargeDeduction)
    + n(inputs.extraExpenseDeduction);
}

/** Payout period (1, 2, or 3) for a given date. */
export function computePayoutPeriod(date: Date | string): 1 | 2 | 3 {
  const d = typeof date === 'string' ? new Date(date) : date;
  const day = d.getDate();
  if (day <= 10) return 1;
  if (day <= 20) return 2;
  return 3;
}

/** [periodStart, periodEnd] for a given period+month+year (inclusive dates). */
export function getPeriodRange(period: 1 | 2 | 3, month: number, year: number): { start: Date; end: Date } {
  // month here is 1-indexed. JS Date uses 0-indexed months.
  const m = month - 1;
  if (period === 1) return { start: new Date(year, m, 1),  end: new Date(year, m, 10, 23, 59, 59, 999) };
  if (period === 2) return { start: new Date(year, m, 11), end: new Date(year, m, 20, 23, 59, 59, 999) };
  // Period 3: day 21 through end of month
  return { start: new Date(year, m, 21), end: new Date(year, m + 1, 0, 23, 59, 59, 999) };
}

/** Human-readable label for a period — e.g. "Apr 1–10, 2026". */
export function formatPeriodLabel(period: 1 | 2 | 3, month: number, year: number): string {
  const { start, end } = getPeriodRange(period, month, year);
  const monthShort = start.toLocaleString('en-US', { month: 'short' });
  return `${monthShort} ${start.getDate()}–${end.getDate()}, ${year}`;
}

/** Productivity score: net pay per hour. Returns null if hours is 0 (don't divide). */
export function computeProductivity(netPay: number, hours: number): number | null {
  if (!hours || hours <= 0) return null;
  return netPay / hours;
}
