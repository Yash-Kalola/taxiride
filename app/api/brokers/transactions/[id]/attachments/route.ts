import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateUpload, saveUpload } from '@/lib/uploads';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const formData = await request.formData();
    const file  = formData.get('file') as File | null;
    const label = (formData.get('label') as string) || '';

    const err = validateUpload(file);
    if (err) return NextResponse.json({ error: err.message }, { status: err.status });

    // Verify transaction exists before writing anything to disk.
    const tx = await prisma.brokerTransaction.findUnique({ where: { id: params.id } });
    if (!tx) return NextResponse.json({ error: 'Transaction not found' }, { status: 404 });

    const { relPath, bytes } = await saveUpload(file!, 'transactions', params.id);

    const attachment = await prisma.transactionAttachment.create({
      data: {
        transactionId: params.id,
        label,
        fileName:  file!.name,
        filePath:  relPath,
        fileType:  file!.type,
        fileSize:  file!.size,
        fileData:  bytes,
      },
      select: { id: true, transactionId: true, label: true, fileName: true, filePath: true, fileType: true, fileSize: true, createdAt: true },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (err) {
    console.error('transaction attachment upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const attachments = await prisma.transactionAttachment.findMany({
      where: { transactionId: params.id },
      orderBy: { createdAt: 'desc' },
      select: { id: true, transactionId: true, label: true, fileName: true, filePath: true, fileType: true, fileSize: true, createdAt: true },
    });
    return NextResponse.json(attachments);
  } catch (err) {
    console.error('list transaction attachments failed:', err);
    return NextResponse.json({ error: 'Failed to load attachments' }, { status: 500 });
  }
}
