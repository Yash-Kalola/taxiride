import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import { validateUpload, saveUpload } from '@/lib/uploads';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const docs = await prisma.vehicleDocument.findMany({
      where: { vehicleId: params.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(docs);
  } catch (err) {
    console.error('list vehicle documents failed:', err);
    return NextResponse.json({ error: 'Failed to load documents' }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const vehicle = await prisma.brokerVehicle.findUnique({ where: { id: params.id } });
    if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

    const formData = await request.formData();
    const file  = formData.get('file') as File | null;
    const label = (formData.get('label') as string) || '';

    const err = validateUpload(file);
    if (err) return NextResponse.json({ error: err.message }, { status: err.status });

    const { relPath } = await saveUpload(file!, 'vehicles', params.id);

    const doc = await prisma.vehicleDocument.create({
      data: {
        vehicleId: params.id,
        label,
        fileName: file!.name,
        filePath: relPath,
        fileType: file!.type,
        fileSize: file!.size,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    console.error('vehicle document upload failed:', err);
    return NextResponse.json({ error: 'Upload failed' }, { status: 500 });
  }
}
