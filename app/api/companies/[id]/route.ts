import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  accountId:            z.string().min(1).optional(),
  companyName:          z.string().min(1).optional(),
  address:              z.string().optional(),
  poNumber:             z.string().optional(),
  expectedMonthlyRides: z.coerce.number().int().min(0).optional(),
  email:                z.string().email().or(z.literal('')).optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  const company = await prisma.company.findUnique({
    where: { id: params.id },
    include: { _count: { select: { rides: true, invoices: true } } },
  });
  if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
  return NextResponse.json(company);
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const company = await prisma.company.update({ where: { id: params.id }, data: parsed.data });
    return NextResponse.json(company);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.company.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
