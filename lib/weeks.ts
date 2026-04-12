/**
 * Week utilities — stand rent uses real Mon→Sun calendar weeks.
 * Week 1 of a month = the week whose Monday is the first Monday of that month.
 */

export function getFirstMonday(month: number, year: number): Date {
  const firstDay = new Date(year, month - 1, 1);
  const dow = firstDay.getDay(); // 0=Sun 1=Mon … 6=Sat
  const daysToMonday = dow === 1 ? 0 : dow === 0 ? 1 : 8 - dow;
  return new Date(year, month - 1, 1 + daysToMonday);
}

export function getWeekDates(weekNumber: number, month: number, year: number): { start: Date; end: Date } {
  const firstMonday = getFirstMonday(month, year);
  const start = new Date(year, month - 1, firstMonday.getDate() + (weekNumber - 1) * 7);
  const end   = new Date(year, month - 1, firstMonday.getDate() +  weekNumber      * 7 - 1);
  return { start, end };
}

export function getCurrentWeekNum(month: number, year: number, today: Date): number {
  const firstMonday = getFirstMonday(month, year);
  const ms = today.getTime() - firstMonday.getTime();
  if (ms < 0) return 0; // before first Monday of this month
  return Math.floor(ms / (7 * 24 * 60 * 60 * 1000)) + 1;
}

export function getWeeksInMonth(month: number, year: number): number {
  const firstMonday = getFirstMonday(month, year);
  const lastDay     = new Date(year, month, 0); // last day of month
  const ms = lastDay.getTime() - firstMonday.getTime();
  if (ms < 0) return 0;
  return Math.ceil((Math.floor(ms / (24 * 60 * 60 * 1000)) + 1) / 7);
}

/** "Apr 6 – Apr 12, 2026" */
export function formatWeekRange(weekNumber: number, month: number, year: number): string {
  const { start, end } = getWeekDates(weekNumber, month, year);
  const fmt = (d: Date) =>
    d.toLocaleDateString('en-US', { month: 'short', day: 'numeric' });
  return `${fmt(start)} – ${fmt(end)}, ${year}`;
}
