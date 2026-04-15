/**
 * Date parsing helpers for user-entered dates.
 *
 * WHY THIS EXISTS:
 *   `new Date("2026-04-10")` parses as UTC midnight, which in Eastern Time
 *   (UTC-5 / UTC-4) shifts to April 9 at 19:00 or 20:00 local. Subsequent
 *   `.getMonth()` / `.getDate()` calls then read "April 9" — so a daily sheet
 *   the driver dated April 10 is stored, reported, and grouped as April 9.
 *
 *   Use `parseLocalDate(str)` whenever the string came from a date-only input
 *   (HTML `<input type="date">` or a "YYYY-MM-DD" field). For full ISO
 *   timestamps from the database or API, keep using `new Date(str)` directly.
 */

/**
 * Parse a "YYYY-MM-DD" string as midnight local time. Preserves the calendar
 * day the user selected regardless of the server's timezone.
 *
 * If the string already contains time info (e.g. a full ISO timestamp), it's
 * delegated to the standard Date constructor.
 *
 * Returns `null` for invalid input so callers can 400 instead of storing NaN.
 */
export function parseLocalDate(input: string | null | undefined): Date | null {
  if (!input) return null;
  const trimmed = input.trim();
  if (!trimmed) return null;

  // Date-only YYYY-MM-DD — build with local TZ constructor.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const dt = new Date(parseInt(y), parseInt(m) - 1, parseInt(d));
    return isNaN(dt.getTime()) ? null : dt;
  }

  // Full ISO or anything else — let Date handle it.
  const dt = new Date(trimmed);
  return isNaN(dt.getTime()) ? null : dt;
}

/**
 * Throwing variant — use in routes after Zod has already validated the shape,
 * when `null` would indicate a bug rather than bad user input.
 */
export function parseLocalDateOrThrow(input: string): Date {
  const d = parseLocalDate(input);
  if (!d) throw new Error(`Invalid date: ${input}`);
  return d;
}
