// Email sending — STUBBED until SMTP credentials are provided.
// Replace the stub body with the nodemailer implementation when ready.

export async function sendInvoiceEmail(params: {
  to: string;
  invoiceNumber: number;
  month: string;
  year: number;
  pdfBuffer: Buffer;
}): Promise<void> {
  // TODO: wire up when SMTP credentials are available
  console.log(
    `[EMAIL STUB] Would send Invoice #${params.invoiceNumber} — Rides for ${params.month} ${params.year} to ${params.to} (${params.pdfBuffer.length} bytes)`
  );

  /* Uncomment and fill in .env.local when SMTP is ready:

  import nodemailer from 'nodemailer';
  const transporter = nodemailer.createTransport({
    host: process.env.SMTP_HOST,
    port: parseInt(process.env.SMTP_PORT || '587'),
    secure: process.env.SMTP_SECURE === 'true',
    auth: { user: process.env.SMTP_USER, pass: process.env.SMTP_PASS },
  });
  await transporter.sendMail({
    from: process.env.EMAIL_FROM,
    to: params.to,
    subject: `Invoice #${params.invoiceNumber} — Rides for ${params.month} ${params.year}`,
    text: `Please find attached invoice #${params.invoiceNumber} for rides in ${params.month} ${params.year}.\n\nThank you,\n17116039 Canada Inc`,
    attachments: [{
      filename: `Invoice-${params.invoiceNumber}-${params.month}-${params.year}.pdf`,
      content: params.pdfBuffer,
      contentType: 'application/pdf',
    }],
  });
  */
}
