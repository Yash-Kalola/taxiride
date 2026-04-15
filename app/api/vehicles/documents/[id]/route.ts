import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const doc = await prisma.vehicleDocument.findUnique({ where: { id: params.id } });
    if (!doc) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Remove file from disk (best-effort)
    try {
      const fullPath = path.join(process.cwd(), 'public', doc.filePath);
      fs.unlinkSync(fullPath);
    } catch {
      // File may already be missing — ignore
    }

    await prisma.vehicleDocument.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
