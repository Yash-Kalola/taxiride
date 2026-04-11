import nodemailer from 'nodemailer';

function formatCurrencyEmail(amount: number): string {
  return new Intl.NumberFormat('en-CA', { style: 'currency', currency: 'CAD' }).format(amount);
}

export async function sendInvoiceEmail(params: {
  to: string;
  invoiceNumber: number;
  month: string;
  year: number;
  pdfBuffer: Buffer;
  total?: number;
  dueDate?: string;
  companyName?: string;
}): Promise<void> {
  // Guard: if SMTP credentials aren't configured yet, log and skip silently
  if (!process.env.SMTP_HOST || !process.env.SMTP_PASS) {
    console.log(
      `[EMAIL] SMTP not configured — skipping send for Invoice #${params.invoiceNumber} to ${params.to}`
    );
    return;
  }

  const transporter = nodemailer.createTransport({
    host:   process.env.SMTP_HOST,
    port:   parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: {
      user: process.env.SMTP_USER,
      pass: process.env.SMTP_PASS,
    },
  });

  const greeting  = params.companyName ? `Dear ${params.companyName},` : 'Hello,';
  const totalLine = params.total   != null ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Amount Due</td><td style="padding:6px 0;font-size:14px;font-weight:700;color:#4f46e5;text-align:right;">${formatCurrencyEmail(params.total)}</td></tr>` : '';
  const dueLine   = params.dueDate            ? `<tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Due Date</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${params.dueDate}</td></tr>` : '';

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
            <h1 style="margin:6px 0 0;font-size:28px;font-weight:800;color:#ffffff;">#${params.invoiceNumber}</h1>
            <p style="margin:4px 0 0;font-size:14px;color:#c7d2fe;">${params.month} ${params.year}</p>
          </td>
        </tr>

        <!-- Body -->
        <tr>
          <td style="padding:32px 36px;">
            <p style="margin:0 0 20px;font-size:15px;color:#374151;">${greeting}</p>
            <p style="margin:0 0 24px;font-size:15px;color:#374151;line-height:1.6;">
              Please find your invoice for transportation services provided in <strong>${params.month} ${params.year}</strong> attached to this email as a PDF.
            </p>

            <!-- Summary table -->
            <table width="100%" cellpadding="0" cellspacing="0" style="border-top:1px solid #e5e7eb;border-bottom:1px solid #e5e7eb;margin-bottom:28px;">
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Invoice #</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">#${params.invoiceNumber}</td></tr>
              <tr><td style="padding:6px 0;color:#6b7280;font-size:14px;">Period</td><td style="padding:6px 0;font-size:14px;font-weight:600;color:#111827;text-align:right;">${params.month} ${params.year}</td></tr>
              ${totalLine}
              ${dueLine}
            </table>

            <p style="margin:0 0 8px;font-size:15px;color:#374151;line-height:1.6;">
              Please remit payment by the due date indicated above. If you have any questions regarding this invoice, please don't hesitate to reach out.
            </p>
            <p style="margin:0;font-size:15px;color:#374151;line-height:1.6;">Thank you for your business.</p>
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

  const text = `${greeting}\n\nPlease find attached invoice #${params.invoiceNumber} for rides in ${params.month} ${params.year}.${params.total != null ? `\nAmount Due: ${formatCurrencyEmail(params.total)}` : ''}${params.dueDate ? `\nDue Date: ${params.dueDate}` : ''}\n\nThank you for your business.\n\n17116039 Canada Inc`;

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to:      params.to,
    subject: `Invoice #${params.invoiceNumber} — Rides for ${params.month} ${params.year}`,
    text,
    html,
    attachments: [{
      filename:    `Invoice-${params.invoiceNumber}-${params.month}-${params.year}.pdf`,
      content:     params.pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}
