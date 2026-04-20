import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword } from '@/lib/auth';
import { ASSIGNABLE_PAGES } from '@/lib/pages';

// Middleware gates these endpoints to admins only.

const assignableKeys = new Set(ASSIGNABLE_PAGES.map((p) => p.key));

const createSchema = z.object({
  username:    z.string().trim().toLowerCase().min(3).max(32).regex(/^[a-z0-9._-]+$/, 'Use letters, numbers, . _ -'),
  displayName: z.string().trim().max(80).optional().default(''),
  password:    z.string().min(8).max(200),
  isAdmin:     z.boolean().optional().default(false),
  allowedPages: z.array(z.string()).optional().default([]),
});

export async function GET() {
  const users = await prisma.user.findMany({
    orderBy: [{ isAdmin: 'desc' }, { username: 'asc' }],
    select: {
      id: true, username: true, displayName: true,
      isAdmin: true, allowedPages: true,
      createdAt: true, updatedAt: true,
    },
  });
  return NextResponse.json(users);
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const pages = parsed.data.allowedPages.filter((k) => assignableKeys.has(k));

  try {
    const user = await prisma.user.create({
      data: {
        username:     parsed.data.username,
        displayName:  parsed.data.displayName || parsed.data.username,
        passwordHash: hashPassword(parsed.data.password),
        isAdmin:      parsed.data.isAdmin,
        allowedPages: parsed.data.isAdmin ? [] : pages,
      },
      select: {
        id: true, username: true, displayName: true,
        isAdmin: true, allowedPages: true,
        createdAt: true, updatedAt: true,
      },
    });
    return NextResponse.json(user, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') {
      return NextResponse.json({ error: 'Username already taken' }, { status: 409 });
    }
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
