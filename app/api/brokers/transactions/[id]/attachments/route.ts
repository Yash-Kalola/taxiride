import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';

const MAX_SIZE = 10 * 1024 * 1024; // 10 MB

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const formData = await request.formData();
    const file  = formData.get('file') as File | null;
    const label = (formData.get('label') as string) || '';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });
    if (file.size > MAX_SIZE) return NextResponse.json({ error: 'File too large (max 10 MB)' }, { status: 400 });

    // Verify transaction exists
    const tx = await prisma.brokerTransaction.findUnique({ where: { id: params.id } });
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'transactions', params.id);
    fs.mkdirSync(uploadDir, { recursive: true });

    const safeName = `${Date.now()}${path.extname(file.name)}`;
    const fullPath = path.join(uploadDir, safeName);
    fs.writeFileSync(fullPath, Buffer.from(await file.arrayBuffer()));

    const relPath = `/uploads/transactions/${params.id}/${safeName}`;

    const attachment = await prisma.transactionAttachment.create({
      data: {
        transactionId: params.id,
        label,
        fileName:  file.name,
        filePath:  relPath,
        fileType:  file.type,
        fileSize:  file.size,
      },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const attachments = await prisma.transactionAttachment.findMany({
      where: { transactionId: params.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(attachments);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
