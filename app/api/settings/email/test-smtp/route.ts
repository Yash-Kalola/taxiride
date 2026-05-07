import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import nodemailer from 'nodemailer';

/**
 * POST /api/settings/email/test-smtp
 *   { recipient: "you@example.com" }
 *
 * Tries to (1) connect to the configured SMTP server and verify the
 * credentials, then (2) send a tiny test email. Returns a structured
 * result with `step`, `success`, and `error` so the UI can show a
 * specific failure point (connect vs send) and give the office a
 * clear diagnostic without going through the whole invoice flow.
 */

const schema = z.object({
  recipient: z.string().email('Recipient must be a valid email'),
});

const SMTP_HOST = process.env.SMTP_HOST || 'smtp.office365.com';
const SMTP_PORT = parseInt(process.env.SMTP_PORT || '587');
const SMTP_SECURE = process.env.SMTP_SECURE ? process.env.SMTP_SECURE === 'true' : false;
const SMTP_USER = process.env.SMTP_USER || 'accountspayable@vetstaxi.ca';
const SMTP_PASS = process.env.SMTP_PASS || 'Vetstaxi@1';
const EMAIL_FROM_DEFAULT = process.env.EMAIL_FROM || SMTP_USER;

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const config = {
    host:   SMTP_HOST,
    port:   SMTP_PORT,
    secure: SMTP_SECURE,
    user:   SMTP_USER,
    from:   EMAIL_FROM_DEFAULT,
  };

  const transporter = nodemailer.createTransport({
    host:   SMTP_HOST,
    port:   SMTP_PORT,
    secure: SMTP_SECURE,
    auth:   { user: SMTP_USER, pass: SMTP_PASS },
  });

  // Step 1: verify the connection + auth
  try {
    await transporter.verify();
  } catch (err: any) {
    return NextResponse.json({
      step:    'connect',
      success: false,
      config,
      error:   typeof err?.message === 'string' ? err.message : 'Unknown SMTP connection error',
    });
  }

  // Step 2: send a tiny test email
  try {
    await transporter.sendMail({
      from:    EMAIL_FROM_DEFAULT,
      to:      parsed.data.recipient,
      subject: 'TaxiRide — SMTP test',
      text:    'This is a test message from your TaxiRide invoicing app. If you received it, SMTP is working correctly.',
      html:    '<p>This is a test message from your TaxiRide invoicing app.</p><p>If you received it, <strong>SMTP is working correctly</strong>.</p>',
    });
  } catch (err: any) {
    return NextResponse.json({
      step:    'send',
      success: false,
      config,
      error:   typeof err?.message === 'string' ? err.message : 'Unknown SMTP send error',
    });
  }

  return NextResponse.json({
    step:    'send',
    success: true,
    config,
    error:   null,
  });
}
