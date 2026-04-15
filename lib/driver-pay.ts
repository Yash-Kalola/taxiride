/**
 * Driver pay & company P&L calculation helpers.
 *
 * Business rules:
 *   1. The driver enters gross earnings for their shift (this is the "100%").
 *   2. Debit transaction fees come OFF THE TOP:
 *        debitFeeTotal = debitFee × debitTransactionCount
 *        adjustedGross = gross − debitFeeTotal          (this is the new "100%")
 *   3. The adjustedGross is split:
 *        driverPay    = adjustedGross × 40%            (driver's take-home — always clean)
 *        companyShare = adjustedGross × 60%            (company's share before expenses)
 *   4. Company-side expenses (gas, call charges, extra) come out of the company's 60%:
 *        companyNet   = companyShare − gas − callCharge − extra
 *      The driver's 40% is never reduced by these expenses.
 *   5. Payout period comes from day-of-month:
 *        day 1–10   = period 1
 *        day 11–20  = period 2
 *        day 21–end = period 3
 */

export const DRIVER_SHARE_RATE  = 0.40;
export const COMPANY_SHARE_RATE = 0.60;

export interface PayInputs {
  grossEarnings: number;
  gasDeduction: number;
  debitFee: number;              // per-transaction fee
  debitTransactionCount: number; // number of debit transactions
  callChargeDeduction: number;
  extraExpenseDeduction: number;
}

export interface PayBreakdown {
  gross: number;           // what the driver entered (100%)
  debitFeeTotal: number;   // debitFee × count (subtracted off the top)
  adjustedGross: number;   // gross − debitFeeTotal (the new 100%)
  driverPay: number;       // adjustedGross × 40% — driver's take-home
  companyShare: number;    // adjustedGross × 60% — company share before expenses
  gas: number;
  callCharge: number;
  extra: number;
  companyExpenses: number; // gas + call + extra
  companyNet: number;      // companyShare − companyExpenses (can be negative if expenses > share)
}

function safe(v: number): number {
  return Number.isFinite(v) ? v : 0;
}

/** The canonical calculation. All other helpers delegate to this. */
export function computePayBreakdown(inputs: PayInputs): PayBreakdown {
  const gross        = safe(inputs.grossEarnings);
  const debitFee     = safe(inputs.debitFee);
  const debitCount   = safe(inputs.debitTransactionCount);
  const gas          = safe(inputs.gasDeduction);
  const callCharge   = safe(inputs.callChargeDeduction);
  const extra        = safe(inputs.extraExpenseDeduction);

  const debitFeeTotal   = debitFee * debitCount;
  const adjustedGross   = gross - debitFeeTotal;
  const driverPay       = adjustedGross * DRIVER_SHARE_RATE;
  const companyShare    = adjustedGross * COMPANY_SHARE_RATE;
  const companyExpenses = gas + callCharge + extra;
  const companyNet      = companyShare - companyExpenses;

  return {
    gross, debitFeeTotal, adjustedGross,
    driverPay, companyShare,
    gas, callCharge, extra, companyExpenses, companyNet,
  };
}

/** Driver take-home (40% of adjusted gross). */
export function computeNetDriverPay(inputs: PayInputs): number {
  return computePayBreakdown(inputs).driverPay;
}

/** Company net from this sheet (60% of adjusted, minus company expenses). */
export function computeCompanyNet(inputs: PayInputs): number {
  return computePayBreakdown(inputs).companyNet;
}

/** Payout period (1, 2, or 3) for a given date.
 *  String input is parsed as a local-date (see lib/dates.ts) so a "YYYY-MM-DD"
 *  from a date picker isn't shifted into the previous day by UTC parsing. */
export function computePayoutPeriod(date: Date | string): 1 | 2 | 3 {
  let d: Date;
  if (typeof date === 'string') {
    // Avoid a runtime import cycle with lib/dates.ts — inline the date-only path.
    const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(date.trim());
    d = dateOnly
      ? new Date(parseInt(dateOnly[1]), parseInt(dateOnly[2]) - 1, parseInt(dateOnly[3]))
      : new Date(date);
  } else {
    d = date;
  }
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

/** Productivity score: pay per hour. Returns null if hours is 0 (don't divide). */
export function computeProductivity(pay: number, hours: number): number | null {
  if (!hours || hours <= 0) return null;
  return pay / hours;
}
