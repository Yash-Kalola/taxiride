import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { renderInvoiceEmailHTML } from '@/lib/email';

/**
 * POST /api/settings/email/preview  — render live preview HTML from editor values
 * without persisting. Uses sample data for placeholder substitution.
 */

const previewSchema = z.object({
  subject: z.string().max(500),
  intro:   z.string().max(4000),
  closing: z.string().max(4000),
});

const SAMPLE_CTX = {
  invoiceNumber: 1596,
  month:         'March',
  year:          2026,
  companyName:   'ABC Transport Ltd.',
  total:         966.0,
  dueDate:       'April 30, 2026',
};

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = previewSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const rendered = renderInvoiceEmailHTML({
    template: parsed.data,
    ctx:      SAMPLE_CTX,
  });
  return NextResponse.json(rendered);
}
