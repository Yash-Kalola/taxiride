import nodemailer from 'nodemailer';

export async function sendInvoiceEmail(params: {
  to: string;
  invoiceNumber: number;
  month: string;
  year: number;
  pdfBuffer: Buffer;
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

  await transporter.sendMail({
    from:    process.env.EMAIL_FROM ?? process.env.SMTP_USER,
    to:      params.to,
    subject: `Invoice #${params.invoiceNumber} — Rides for ${params.month} ${params.year}`,
    text:    `Please find attached invoice #${params.invoiceNumber} for rides in ${params.month} ${params.year}.\n\nThank you,\n17116039 Canada Inc`,
    attachments: [{
      filename:    `Invoice-${params.invoiceNumber}-${params.month}-${params.year}.pdf`,
      content:     params.pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
}
