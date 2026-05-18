/**
 * Date parsing helpers for user-entered dates.
 *
 * WHY THIS EXISTS:
 *   `new Date("2026-04-10")` parses as UTC midnight. On Vercel the server
 *   runs in UTC, so storing "2026-05-04" via a naive constructor saved it
 *   as 2026-05-04T00:00:00Z. When the office (in EDT, UTC-4) read it back
 *   the browser rendered it as May 3 at 8pm, and `format(d, 'MMM d')`
 *   showed "May 3" — but the edit form, which split the raw ISO string at
 *   "T", showed "2026-05-04". User picks May 4 → row shows May 3.
 *
 *   Fix: anchor user-entered date-only values to NOON UTC of the intended
 *   calendar day. Noon UTC stays inside the same calendar day in every
 *   IANA timezone from UTC-11 to UTC+12, so display, edit form, and the
 *   server's month/year extraction (Vercel is in UTC) all stay aligned.
 *
 *   Use `parseLocalDate(str)` whenever the string came from a date-only
 *   input (HTML `<input type="date">` or a "YYYY-MM-DD" field). For full
 *   ISO timestamps from the database or API, keep using `new Date(str)`.
 */

/**
 * Parse a "YYYY-MM-DD" string as noon UTC of that calendar day. Preserves
 * the calendar day the user selected in every timezone the app gets used in.
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

  // Date-only YYYY-MM-DD — anchor at noon UTC to avoid timezone day-shifting.
  const dateOnly = /^(\d{4})-(\d{2})-(\d{2})$/.exec(trimmed);
  if (dateOnly) {
    const [, y, m, d] = dateOnly;
    const dt = new Date(Date.UTC(parseInt(y), parseInt(m) - 1, parseInt(d), 12, 0, 0));
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
