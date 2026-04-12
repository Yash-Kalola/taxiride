import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';
import path from 'path';
import fs from 'fs';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const docs = await prisma.vehicleDocument.findMany({
      where: { vehicleId: params.id },
      orderBy: { createdAt: 'desc' },
    });
    return NextResponse.json(docs);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const vehicle = await prisma.brokerVehicle.findUnique({ where: { id: params.id } });
    if (!vehicle) return NextResponse.json({ error: 'Vehicle not found' }, { status: 404 });

    const formData = await request.formData();
    const file  = formData.get('file') as File | null;
    const label = (formData.get('label') as string) || '';

    if (!file) return NextResponse.json({ error: 'No file provided' }, { status: 400 });

    // Create upload directory
    const uploadDir = path.join(process.cwd(), 'public', 'uploads', 'vehicles', params.id);
    fs.mkdirSync(uploadDir, { recursive: true });

    // Use timestamp prefix to avoid filename collisions
    const ext      = path.extname(file.name);
    const safeName = `${Date.now()}${ext}`;
    const fullPath = path.join(uploadDir, safeName);
    const buffer   = Buffer.from(await file.arrayBuffer());
    fs.writeFileSync(fullPath, buffer);

    const relPath = `/uploads/vehicles/${params.id}/${safeName}`;

    const doc = await prisma.vehicleDocument.create({
      data: {
        vehicleId: params.id,
        label,
        fileName: file.name,
        filePath: relPath,
        fileType: file.type,
        fileSize: file.size,
      },
    });

    return NextResponse.json(doc, { status: 201 });
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
