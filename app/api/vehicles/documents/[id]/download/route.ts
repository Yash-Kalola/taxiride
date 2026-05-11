import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await prisma.vehicleDocument.findUnique({
      where:  { id: params.id },
      select: { fileName: true, fileType: true, fileData: true },
    });
    if (!doc || !doc.fileData) {
      return NextResponse.json({ error: 'Document not found' }, { status: 404 });
    }
    return new NextResponse(doc.fileData as unknown as ArrayBuffer, {
      status: 200,
      headers: {
        'Content-Type':        doc.fileType || 'application/octet-stream',
        'Content-Disposition': `inline; filename="${doc.fileName.replace(/"/g, '')}"`,
      },
    });
  } catch (err) {
    console.error('vehicle document download failed:', err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
