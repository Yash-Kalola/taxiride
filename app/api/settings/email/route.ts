import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { DEFAULT_EMAIL_TEMPLATE, loadEmailTemplate } from '@/lib/email';

/**
 * GET  /api/settings/email  — load current template (fallback to defaults)
 * POST /api/settings/email  — upsert the single "default" row
 *
 * Note: Originally used PUT but some Vercel/CDN configurations return 405
 * for PUT on dynamically-generated routes. POST is universally supported.
 */

const saveSchema = z.object({
  subject: z.string().trim().min(1, 'Subject is required').max(500),
  intro:   z.string().trim().min(1, 'Intro is required').max(4000),
  closing: z.string().trim().min(1, 'Closing is required').max(4000),
});

export async function GET() {
  const tpl = await loadEmailTemplate();
  return NextResponse.json({ ...tpl, defaults: DEFAULT_EMAIL_TEMPLATE });
}

async function saveTemplate(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = saveSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const row = await prisma.emailTemplate.upsert({
      where:  { id: 'default' },
      update: parsed.data,
      create: { id: 'default', ...parsed.data },
    });
    return NextResponse.json({
      subject: row.subject,
      intro:   row.intro,
      closing: row.closing,
    });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) { return saveTemplate(request); }
// Keep PUT for backward compatibility with anything calling the old method.
export async function PUT(request: NextRequest)  { return saveTemplate(request); }
