import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  cabNumber:       z.string().min(1).optional(),
  brokerId:        z.string().nullable().optional(),
  isCompanyCar:    z.boolean().optional(),
  insuranceAmount: z.number().optional(),
  isActive:        z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const v = await prisma.brokerVehicle.findUnique({ where: { id: params.id }, include: { broker: true } });
    if (!v) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(v);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body = await req.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  try {
    const v = await prisma.brokerVehicle.update({
      where: { id: params.id },
      data: parsed.data,
      include: { broker: { select: { id: true, name: true } } },
    });
    return NextResponse.json(v);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.brokerVehicle.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
