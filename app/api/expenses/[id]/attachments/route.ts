import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateUpload, saveUpload } from '@/lib/uploads';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const expense = await prisma.brokerExpense.findUnique({ where: { id: params.id } });
    if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

    const formData = await request.formData();
    const file  = formData.get('file') as File | null;
    const label = (formData.get('label') as string) || '';

    const err = validateUpload(file);
    if (err) return NextResponse.json({ error: err.message }, { status: err.status });

    const { relPath, bytes } = await saveUpload(file!, 'expenses', params.id);

    const attachment = await prisma.expenseAttachment.create({
      data: {
        expenseId: params.id,
        label,
        fileName:  file!.name,
        filePath:  relPath,
        fileType:  file!.type,
        fileSize:  file!.size,
        fileData:  bytes,
      },
      // Don't ship the bytes back in the create response — keeps the JSON small
      select: { id: true, expenseId: true, label: true, fileName: true, filePath: true, fileType: true, fileSize: true, createdAt: true },
    });

    return NextResponse.json(attachment, { status: 201 });
  } catch (err) {
    console.error('expense attachment upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
