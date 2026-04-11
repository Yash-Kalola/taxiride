import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  type:        z.enum(['STAND_RENT', 'COMPANY_PAYMENT', 'PRODUCT_CHARGE', 'INSURANCE', 'PAYOUT', 'OTHER']).optional(),
  amount:      z.coerce.number().optional(),
  description: z.string().optional(),
  dueDate:     z.string().nullable().optional(),
  month:       z.coerce.number().int().min(1).max(12).optional(),
  year:        z.coerce.number().int().optional(),
  status:      z.enum(['PAID', 'PENDING', 'VOID']).optional(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.dueDate) data.dueDate = new Date(parsed.data.dueDate);
    if (parsed.data.dueDate === null) data.dueDate = null;

    const tx = await prisma.brokerTransaction.update({ where: { id: params.id }, data });
    return NextResponse.json(tx);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.brokerTransaction.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
