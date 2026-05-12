import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { Resend } from 'resend';

/**
 * POST /api/settings/email/test-smtp
 *   { recipient: "you@example.com" }
 *
 * Sends a tiny test email via Resend. Returns a structured result with
 * `step`, `success`, and `error` so the UI can show a specific failure.
 *
 * Endpoint name is "test-smtp" for legacy reasons — backend was switched
 * from Microsoft 365 SMTP to Resend on 2026-05-12.
 */

const schema = z.object({
  recipient: z.string().email('Recipient must be a valid email'),
});

const RESEND_API_KEY = process.env.RESEND_API_KEY || 're_YP5qupYQ_MaGt3YSizKiL8GJJMYn3nnCo';
const RESEND_FROM    = process.env.RESEND_FROM    || 'Vets Taxi <onboarding@resend.dev>';
const EMAIL_REPLY_TO = process.env.EMAIL_REPLY_TO || 'accountspayable@vetstaxi.ca';

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  // Public config — no API key — so the UI can show what's being used.
  const config = {
    provider: 'Resend',
    from:     RESEND_FROM,
    replyTo:  EMAIL_REPLY_TO,
  };

  if (!RESEND_API_KEY) {
    return NextResponse.json({
      step:    'connect',
      success: false,
      config,
      error:   'RESEND_API_KEY is not configured on the server.',
    });
  }

  try {
    const resend = new Resend(RESEND_API_KEY);
    const { data, error } = await resend.emails.send({
      from:     RESEND_FROM,
      to:       parsed.data.recipient,
      replyTo:  EMAIL_REPLY_TO,
      subject:  'TaxiRide — email test',
      text:     'This is a test message from your TaxiRide invoicing app. If you received it, email delivery is working correctly.',
      html:     '<p>This is a test message from your TaxiRide invoicing app.</p><p>If you received it, <strong>email delivery is working correctly</strong>.</p>',
    });
    if (error) {
      const msg = (error as any)?.message || (error as any)?.name || JSON.stringify(error);
      return NextResponse.json({
        step:    'send',
        success: false,
        config,
        error:   `Resend: ${msg}`,
      });
    }
    return NextResponse.json({
      step:    'send',
      success: true,
      config,
      error:   null,
      emailId: data?.id,
    });
  } catch (err: any) {
    return NextResponse.json({
      step:    'send',
      success: false,
      config,
      error:   typeof err?.message === 'string' ? err.message : 'Unknown error sending test email',
    });
  }
}
