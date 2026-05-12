import { Resend } from 'resend';
import { prisma } from './db';

function formatCurrencyEmail(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

// Defaults must stay in sync with the `EmailTemplate` model defaults.
// They're used when the template row is missing (fresh DB) or when
// preview generation runs without a row (e.g. first-time visitor).
export const DEFAULT_EMAIL_TEMPLATE = {
  subject: 'Invoice #{{invoiceNumber}} — Rides for {{month}} {{year}}',
  intro:   'Please find your invoice for transportation services provided in {{month}} {{year}} attached to this email as a PDF.',
  closing: "Please remit payment by the due date indicated above. If you have any questions regarding this invoice, please don't hesitate to reach out.\n\nThank you for your business.",
};

export interface EmailTemplateFields {
  subject: string;
  intro:   string;
  closing: string;
}

export interface TemplateContext {
  invoiceNumber: number;
  month:         string;
  year:          number;
  companyName?:  string;
  total?:        number;
  dueDate?:      string;
}

/** Substitute {{placeholders}} in a template string. Unknown tags are left untouched. */
export function applyTemplate(tmpl: string, ctx: TemplateContext): string {
  const map: Record<string, string> = {
    invoiceNumber: String(ctx.invoiceNumber),
    month:         ctx.month,
    year:          String(ctx.year),
    companyName:   ctx.companyName ?? '',
    total:         ctx.total    != null ? formatCurrencyEmail(ctx.total) : '',
    dueDate:       ctx.dueDate ?? '',
  };
  return tmpl.replace(/\{\{\s*(\w+)\s*\}\}/g, (full, key) =>
    Object.prototype.hasOwnProperty.call(map, key) ? map[key] : full,
  );
}

/** Load the single editable template row; fall back to defaults. */
export async function loadEmailTemplate(): Promise<EmailTemplateFields> {
  try {
    const row = await prisma.emailTemplate.findUnique({ where: { id: 'default' } });
    if (!row) return { ...DEFAULT_EMAIL_TEMPLATE };
    return { subject: row.subject, intro: row.intro, closing: row.closing };
  } catch {
    return { ...DEFAULT_EMAIL_TEMPLATE };
  }
}

/** Escape for interpolation inside HTML text nodes. */
function escapeHtml(s: string): string {
  return s
    .replace(/&/g, '&amp;')
    .replace(/</g, '&lt;')
    .replace(/>/g, '&gt;')
    .replace(/"/g, '&quot;')
    .replace(/'/g, '&#39;');
}

/** Turn plain-text with line breaks into HTML paragraphs. */
function textToParagraphs(txt: string): string {
  return txt
    .split(/\n{2,}/)
    .map((p) => `<p style="margin:0 0 16px;font-size:15px;color:#374151;line-height:1.6;">${escapeHtml(p).replace(/\n/g, '<br/>')}</p>`)
    .join('');
}

/** Render the full HTML for an invoice email (used by preview + by send). */
export function renderInvoiceEmailHTML(params: {
  template: EmailTemplateFields;
  ctx:      TemplateContext;
}): { subject: string; html: string; text: string } {
  const { template, ctx } = params;
  const subject = applyTemplate(template.subject, ctx);
  const intro   = applyTemplate(template.intro,   ctx);
  const closing = applyTemplate(template.closing, ctx);
  const greeting = ctx.companyName ? `Dear ${ctx.companyName},` : 'Hello,';
  const totalLine = ctx.total   != null ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Amount Due</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#4f46e5;text-align:right;">${formatCurrencyEmail(ctx.total)}</td></tr>` : '';
  const dueLine   = ctx.dueDate           ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Due Date</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${escapeHtml(ctx.dueDate)}</td></tr>` : '';

  const html = `<!DOCTYPE html>
<html lang="en">
<head><meta charset="UTF-8"><meta name="viewport" content="width=device-width,initial-scale=1"></head>
<body style="margin:0;padding:0;background-color:#f9fafb;font-family:-apple-system,BlinkMacSystemFont,'Segoe UI',Roboto,sans-serif;">
  <table width="100%" cellpadding="0" cellspacing="0" style="background-color:#f9fafb;padding:40px 16px;">
    <tr><td align="center">
      <table width="100%" style="max-width:560px;background:#ffffff;border-radius:16px;overflow:hidden;box-shadow:0 1px 3px rgba(0,0,0,.1);">

        <!-- Header -->
        <tr>
          <td style="background:linear-gradient(135deg,#4f46e5,#6366f1);padding:32px 36px;">
            <p style="margin:0;font-size:13px;font-weight:700;letter-spacing:.08em;text-transform:uppercase;color:#c7d2fe;">Invoice</p>
            <h1 style="margin:6px 0 0;font-size:28px;font-weight:800;color:#ffffff;">#${ctx.invoiceNumber}</h1>
            <p style="margin:4px 0 0;font-size:14px;color:#c7d2fe;">${escapeHtml(ctx.month)} ${ctx.year}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;">${escapeHtml(greeting)}</p>
            ${textToParagraphs(intro)}

            <!-- Summary table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:28px;">
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Invoice #</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">#${ctx.invoiceNumber}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Period</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${escapeHtml(ctx.month)} ${ctx.year}</td></tr>
              ${totalLine}
              ${dueLine}
            </table>

            ${textToParagraphs(closing)}
          </td>
        </tr>

        <!-- Footer -->
        <tr>
          <td style="background:#f9fafb;padding:20px 36px;border-top:1px solid #e5e7eb;">
            <p style="margin:0;font-size:13px;color:#9ca3af;text-align:center;">17116039 Canada Inc</p>
          </td>
        </tr>

      </table>
    </td></tr>
  </table>
</body>
</html>`;

  const text = `${greeting}\n\n${intro}${ctx.total != null ? `\n\nAmount Due: ${formatCurrencyEmail(ctx.total)}` : ''}${ctx.dueDate ? `\nDue Date: ${ctx.dueDate}` : ''}\n\n${closing}\n\n17116039 Canada Inc`;

  return { subject, html, text };
}

// ─────────────────────────────────────────────────────────────────────────
// Email backend: Resend (https://resend.com)
//
// Previously we used Nodemailer + Microsoft 365 SMTP, but Microsoft kept
// rejecting the login (535 5.7.139 — Authenticated SMTP disabled at tenant
// level) and the office couldn't get past it. Resend has a 3,000-email/mo
// free tier and a single API key that just works.
//
// IMPORTANT: until the sender domain (vetstaxi.ca) is verified on Resend,
// emails must be sent FROM `onboarding@resend.dev` — Resend rejects any
// other from-address. Setting RESEND_FROM in env to a verified address
// is how the office upgrades later without a code change.
// ─────────────────────────────────────────────────────────────────────────
const RESEND_API_KEY  = process.env.RESEND_API_KEY  || 're_YP5qupYQ_MaGt3YSizKiL8GJJMYn3nnCo';
// Default From: Resend's onboarding sender. Reads as "Vets Taxi <onboarding@resend.dev>".
// Once vetstaxi.ca is verified on Resend, set RESEND_FROM=Vets Taxi <accountspayable@vetstaxi.ca>
const RESEND_FROM     = process.env.RESEND_FROM     || 'Vets Taxi <onboarding@resend.dev>';
// Replies go to the office mailbox regardless of who the email is sent FROM.
const EMAIL_REPLY_TO  = process.env.EMAIL_REPLY_TO  || 'accountspayable@vetstaxi.ca';

function resendConfigured(): boolean {
  return !!RESEND_API_KEY;
}

let _resendClient: Resend | null = null;
function getResend(): Resend {
  if (!_resendClient) _resendClient = new Resend(RESEND_API_KEY);
  return _resendClient;
}

/**
 * Throw on Resend error — the caller's try/catch turns this into the
 * "emailError" surfaced in the UI, so the office sees a real message
 * instead of a silent success.
 */
async function sendViaResend(payload: {
  from:        string;
  to:          string;
  replyTo?:    string;
  subject:     string;
  html:        string;
  text:        string;
  filename:    string;
  pdfBuffer:   Buffer;
}): Promise<void> {
  const { data, error } = await getResend().emails.send({
    from:     payload.from,
    to:       payload.to,
    replyTo:  payload.replyTo,
    subject:  payload.subject,
    html:     payload.html,
    text:     payload.text,
    attachments: [{
      filename: payload.filename,
      content:  payload.pdfBuffer,
    }],
  });
  if (error) {
    // Resend returns structured errors like { name: 'validation_error', message: '...' }
    const msg = (error as any)?.message || (error as any)?.name || JSON.stringify(error);
    throw new Error(`Resend: ${msg}`);
  }
  if (!data?.id) {
    throw new Error('Resend: no email id returned');
  }
}

/**
 * Generic attachment-email sender. Used for driver reports / broker statements
 * and any other PDF-by-email flow. `from` override is optional and defaults to
 * the configured RESEND_FROM.
 */
export async function sendEmailWithPDF(params: {
  to:          string;
  from?:       string;
  subject:     string;
  html:        string;
  text:        string;
  pdfBuffer:   Buffer;
  pdfFilename: string;
}): Promise<void> {
  if (!resendConfigured()) {
    console.log(`[EMAIL] Resend not configured — skipping send to ${params.to} (${params.subject})`);
    return;
  }
  await sendViaResend({
    from:      params.from || RESEND_FROM,
    to:        params.to,
    replyTo:   EMAIL_REPLY_TO,
    subject:   params.subject,
    html:      params.html,
    text:      params.text,
    filename:  params.pdfFilename,
    pdfBuffer: params.pdfBuffer,
  });
}

export async function sendInvoiceEmail(params: {
  to: string;
  from?: string;
  invoiceNumber: number;
  month: string;
  year: number;
  pdfBuffer: Buffer;
  total?: number;
  dueDate?: string;
  companyName?: string;
}): Promise<void> {
  if (!resendConfigured()) {
    console.log(
      `[EMAIL] Resend not configured — skipping send for Invoice #${params.invoiceNumber} to ${params.to}`
    );
    return;
  }

  const template = await loadEmailTemplate();
  const { subject, html, text } = renderInvoiceEmailHTML({
    template,
    ctx: {
      invoiceNumber: params.invoiceNumber,
      month:         params.month,
      year:          params.year,
      companyName:   params.companyName,
      total:         params.total,
      dueDate:       params.dueDate,
    },
  });

  await sendViaResend({
    from:      params.from || RESEND_FROM,
    to:        params.to,
    replyTo:   EMAIL_REPLY_TO,
    subject,
    html,
    text,
    filename:  `Invoice-${params.invoiceNumber}-${params.month}-${params.year}.pdf`,
    pdfBuffer: params.pdfBuffer,
  });
}
