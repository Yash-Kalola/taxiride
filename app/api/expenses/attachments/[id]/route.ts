import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const att = await prisma.expenseAttachment.findUnique({ where: { id: params.id } });
    if (!att) return NextResponse.json({ error: 'Not found' }, { status: 404 });

    try {
      fs.unlinkSync(path.join(process.cwd(), 'public', att.filePath));
    } catch {
      // File already missing — ignore
    }

    await prisma.expenseAttachment.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
