import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const expense = await prisma.brokerExpense.findUnique({ where: { id: params.id } });
    if (!expense) return NextResponse.json({ error: 'Expense not found' }, { status: 404 });

    const formData = await request.formData();
    const file  = formData.get('file') as File | null;
    const label = (formData.get('label') as string) || '';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Save to disk
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'expenses', params.id);
    fs.mkdirSync(uploadDir, { recursive: true });

    const ext      = path.extname(file.name);
    const safeName = `${Date.now()}${ext}`;
    const fullPath = path.join(uploadDir, safeName);
    fs.writeFileSync(fullPath, Buffer.from(await file.arrayBuffer()));

    const relPath = `/uploads/expenses/${params.id}/${safeName}`;

    const attachment = await prisma.expenseAttachment.create({
      data: {
        expenseId: params.id,
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
