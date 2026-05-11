import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

/**
 * GET /api/expenses/attachments/[id]/download
 * Streams the attachment bytes from the DB. Used because Vercel's runtime
 * filesystem is read-only — files saved during upload are stored as bytes
 * directly in the database row.
 */
export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const att = await prisma.expenseAttachment.findUnique({
      where:  { id: params.id },
      select: { fileName: true, fileType: true, fileData: true },
    });
    if (!att || !att.fileData) {
      return NextResponse.json({ error: 'Attachment not found' }, { status: 404 });
    }
    return new NextResponse(att.fileData as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':        att.fileType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${att.fileName.replace(/"/g, '')}"`,
      },
    });
  } catch (err) {
    console.error('expense attachment download failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
