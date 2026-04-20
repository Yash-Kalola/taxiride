import { NextResponse } from 'next/server';
import { getCurrentSession } from '@/lib/auth';

export async function GET() {
  const sess = await getCurrentSession();
  if (!sess) return NextResponse.json({ user: null }, { status: 200 });
  return NextResponse.json({
    user: {
      id:       sess.uid,
      username: sess.un,
      isAdmin:  sess.admin,
      pages:    sess.pages,
    },
  });
}
