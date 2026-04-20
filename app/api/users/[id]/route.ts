import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { hashPassword, getCurrentSession } from '@/lib/auth';
import { ASSIGNABLE_PAGES } from '@/lib/pages';

const assignableKeys = new Set(ASSIGNABLE_PAGES.map((p) => p.key));

const patchSchema = z.object({
  displayName:  z.string().trim().max(80).optional(),
  password:     z.string().min(8).max(200).optional(),
  isAdmin:      z.boolean().optional(),
  allowedPages: z.array(z.string()).optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const sess = await getCurrentSession();
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });

  try {
    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Safety rail: never let the last admin demote themselves or be demoted
    // to non-admin — otherwise the system is locked out of its own user-mgmt.
    if (existing.isAdmin && parsed.data.isAdmin === false) {
      const adminCount = await prisma.user.count({ where: { isAdmin: true } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot demote the last admin' }, { status: 409 });
      }
    }

    const data: any = {};
    if (parsed.data.displayName !== undefined) data.displayName  = parsed.data.displayName;
    if (parsed.data.isAdmin     !== undefined) data.isAdmin      = parsed.data.isAdmin;
    if (parsed.data.password) data.passwordHash = hashPassword(parsed.data.password);
    if (parsed.data.allowedPages !== undefined) {
      const willBeAdmin = parsed.data.isAdmin !== undefined ? parsed.data.isAdmin : existing.isAdmin;
      data.allowedPages = willBeAdmin ? [] : parsed.data.allowedPages.filter((k) => assignableKeys.has(k));
    } else if (parsed.data.isAdmin === true) {
      data.allowedPages = []; // admins don't need explicit list
    }

    const user = await prisma.user.update({
      where: { id: params.id },
      data,
      select: {
        id: true, username: true, displayName: true,
        isAdmin: true, allowedPages: true,
        createdAt: true, updatedAt: true,
      },
    });
    return NextResponse.json(user);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_request: NextRequest, { params }: { params: { id: string } }) {
  const sess = await getCurrentSession();
  if (!sess) return NextResponse.json({ error: 'Not authenticated' }, { status: 401 });
  if (sess.uid === params.id) {
    return NextResponse.json({ error: 'You cannot delete yourself' }, { status: 409 });
  }

  try {
    const existing = await prisma.user.findUnique({ where: { id: params.id } });
    if (!existing) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    if (existing.isAdmin) {
      const adminCount = await prisma.user.count({ where: { isAdmin: true } });
      if (adminCount <= 1) {
        return NextResponse.json({ error: 'Cannot delete the last admin' }, { status: 409 });
      }
    }

    await prisma.user.delete({ where: { id: params.id } });
    return NextResponse.json({ ok: true });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
