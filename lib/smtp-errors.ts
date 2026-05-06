/**
 * Translate raw SMTP/Nodemailer error strings into a user-friendly message
 * that the office staff can act on, plus an optional "details" string for
 * the technical full-text. Used by InvoiceDetailClient when an email fails
 * to send so non-technical users see a clear next step instead of a stack
 * trace.
 */

export interface FriendlyEmailError {
  /** One-line plain-English summary, suitable for the warning banner. */
  title: string;
  /** Optional 1-3 sentence explanation of likely cause. */
  cause?: string;
  /** Optional concrete next step the user can take. */
  action?: string;
  /** Original technical error text — shown collapsed for support/debug. */
  raw: string;
}

const PATTERNS: Array<{
  match:  RegExp;
  title:  string;
  cause?: string;
  action?: string;
}> = [
  // Microsoft 365 — SMTP AUTH disabled at tenant/mailbox level.
  // Microsoft turns this off by default; admin has to opt back in.
  {
    match:  /535\s*5\.7\.139/i,
    title:  'Microsoft 365 rejected the login',
    cause:  'The email account has SMTP authentication disabled. Microsoft turns this off by default for security.',
    action: 'In the Microsoft 365 admin centre, open the mailbox under Users → Active users, click Mail → Manage email apps, then enable "Authenticated SMTP".',
  },
  // Microsoft 365 — bad password / MFA without app-password.
  {
    match:  /535\s*5\.7\.3/i,
    title:  'Wrong email password',
    cause:  'Microsoft 365 rejected the password for the sending mailbox. If multi-factor auth is enabled on the mailbox, the regular password will not work — an app password is required.',
    action: 'Check the password is current. If MFA is on, generate an app password in the mailbox security settings and provide it so it can be set on the server.',
  },
  // Generic auth failure
  {
    match:  /535|EAUTH|Invalid login|Authentication unsuccessful|authentication failed/i,
    title:  'Email server rejected the login',
    cause:  'The SMTP username or password is incorrect, or the account has restrictions on outbound email.',
    action: 'Verify the email account password and that SMTP sending is allowed for it.',
  },
  // Recipient errors
  {
    match:  /550\s*5\.1\.1|recipient.*not\s*found|user.*unknown|no such user/i,
    title:  'Recipient email address does not exist',
    cause:  "The destination mailbox couldn't be found. The address may be typed incorrectly or the account may be closed.",
    action: 'Check the company email address on the Companies page and update it if needed.',
  },
  {
    match:  /550\s*5\.7\.1|spam|blocked|blacklist|denied|policy/i,
    title:  'Email was blocked by the recipient server',
    cause:  'The recipient server flagged the message as spam or blocked our address.',
    action: 'Try again in a few minutes. If it keeps failing, contact the company and ask them to whitelist our sending address.',
  },
  // Connection issues
  {
    match:  /ECONNREFUSED|ENOTFOUND|EHOSTUNREACH/i,
    title:  'Could not reach the email server',
    cause:  'The SMTP server hostname could not be resolved or the connection was refused.',
    action: 'This usually means the SMTP server settings are wrong or the server is offline. Try again in a minute.',
  },
  {
    match:  /ETIMEDOUT|ESOCKET|timeout/i,
    title:  'Connection to the email server timed out',
    cause:  'The email server did not respond in time, often a temporary network glitch.',
    action: 'Wait a moment and click Resend. If it keeps timing out, the SMTP server may be down.',
  },
  // SMTP not configured (our own guard)
  {
    match:  /SMTP not configured|SMTP_HOST/i,
    title:  'Email is not set up on the server',
    cause:  'No SMTP credentials are configured for this deployment.',
    action: 'Set the SMTP_HOST / SMTP_USER / SMTP_PASS environment variables on Vercel and redeploy.',
  },
];

export function prettifyEmailError(raw: string | null | undefined): FriendlyEmailError | null {
  if (!raw) return null;
  for (const p of PATTERNS) {
    if (p.match.test(raw)) {
      return { title: p.title, cause: p.cause, action: p.action, raw };
    }
  }
  // Unknown error — keep the raw text but trim it down so the banner stays readable.
  return {
    title: 'Email could not be delivered',
    cause: undefined,
    action: 'Try again in a minute. If the problem persists, copy the technical details below and contact support.',
    raw,
  };
}
