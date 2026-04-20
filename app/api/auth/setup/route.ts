import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, hasAnyUsers } from '@/lib/auth';
import { createSessionCookie, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth-session';

const schema = z.object({
  username:    z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9._-]+$/, 'Use letters, numbers, . _ -'),
  displayName: z.string().trim().max(80).optional(),
  password:    z.string().min(8).max(200),
});

/**
 * POST /api/auth/setup — one-time bootstrap. Creates the first admin user.
 * Disabled once any User row exists.
 */
export async function POST(request: NextRequest) {
  if (await hasAnyUsers()) {
    return NextResponse.json({ error: 'Setup already complete' }, { status: 409 });
  }

  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  try {
    const user = await prisma.user.create({
      data: {
        username:     parsed.data.username,
        displayName:  parsed.data.displayName || parsed.data.username,
        passwordHash: hashPassword(parsed.data.password),
        isAdmin:      true,
        allowedPages: [],  // admin has implicit access to everything
      },
    });

    const cookie = await createSessionCookie({
      uid:   user.id,
      un:    user.username,
      admin: true,
      pages: [],
    });

    const res = NextResponse.json({
      id:       user.id,
      username: user.username,
      isAdmin:  true,
    });
    res.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   SESSION_TTL_SECONDS,
    });
    return res;
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function GET() {
  return NextResponse.json({ setupNeeded: !(await hasAnyUsers()) });
}
