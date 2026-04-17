import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * DELETE /api/company-expenses/attachments/[id]   — delete one attachment
 * (the file on disk is left in place; only the DB record is removed)
 */
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.companyExpenseAttachment.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
