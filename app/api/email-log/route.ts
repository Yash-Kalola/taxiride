import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/email-log?recipientType=DRIVER&recipientId=xxx
 * Lists the most recent email-sends for a given recipient (driver / broker / invoice).
 */
export async function GET(request: NextRequest) {
  const url = new URL(request.url);
  const recipientType = url.searchParams.get('recipientType');
  const recipientId   = url.searchParams.get('recipientId');

  if (!recipientType || !recipientId) {
    return NextResponse.json({ error: 'recipientType and recipientId are required' }, { status: 400 });
  }

  const logs = await prisma.emailLog.findMany({
    where:   { recipientType, recipientId },
    orderBy: { sentAt: 'desc' },
    take:    50,
  });
  return NextResponse.json(logs);
}
