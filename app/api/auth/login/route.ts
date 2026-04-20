import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { verifyPassword } from '@/lib/auth';
import { createSessionCookie, SESSION_COOKIE, SESSION_TTL_SECONDS } from '@/lib/auth-session';

const schema = z.object({
  username: z.string().trim().min(1),
  password: z.string().min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: 'Invalid input' }, { status: 400 });

  const { username, password } = parsed.data;

  try {
    const user = await prisma.user.findUnique({
      where: { username: username.toLowerCase() },
    });
    // Same error message for "no such user" and "wrong password" — don't
    // leak which usernames exist.
    if (!user || !verifyPassword(password, user.passwordHash)) {
      return NextResponse.json({ error: 'Invalid username or password' }, { status: 401 });
    }

    const cookie = await createSessionCookie({
      uid:   user.id,
      un:    user.username,
      admin: user.isAdmin,
      pages: user.allowedPages,
    });

    const res = NextResponse.json({
      id:          user.id,
      username:    user.username,
      displayName: user.displayName,
      isAdmin:     user.isAdmin,
      pages:       user.allowedPages,
    });
    res.cookies.set(SESSION_COOKIE, cookie, {
      httpOnly: true,
      sameSite: 'lax',
      secure:   process.env.NODE_ENV === 'production',
      path:     '/',
      maxAge:   SESSION_TTL_SECONDS,
    });
    return res;
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
