import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

/**
 * Admin-only. Middleware scopes /api/settings/senders to admins via the
 * same rule that gates /api/users.
 */

const schema = z.object({
  label:     z.string().trim().min(1).max(80),
  email:     z.string().trim().toLowerCase().email().max(160),
  isDefault: z.boolean().optional().default(false),
});

export async function GET() {
  const senders = await prisma.emailSender.findMany({
    orderBy: [{ isDefault: 'desc' }, { label: 'asc' }],
  });
  return NextResponse.json(senders);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    // Only one default — clear any existing default if this one is marked default.
    const created = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.emailSender.updateMany({ where: { isDefault: true }, data: { isDefault: false } });
      }
      return tx.emailSender.create({ data: parsed.data });
    });
    return NextResponse.json(created, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'That email is already configured' }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
