import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const att = await prisma.transactionAttachment.findUnique({ where: { id: params.id } });
    if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    // Remove file from disk (best-effort)
    try {
      fs.unlinkSync(path.join(process.cwd(), 'public', att.filePath));
    } catch {}

    await prisma.transactionAttachment.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
