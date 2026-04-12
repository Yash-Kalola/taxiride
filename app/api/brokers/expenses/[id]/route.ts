import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const putSchema = z.object({
  cabNumber: z.string().optional(),
  date:      z.string().optional(),
  amount:    z.number().optional(),
  note:      z.string().optional(),
});

export async function PUT(req: NextRequest, { params }: { params: { id: string } }) {
  const body   = await req.json().catch(() => null);
  const parsed = putSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsed.data.date) data.date = new Date(parsed.data.date);

    const updated = await prisma.brokerExpense.update({
      where: { id: params.id },
      data,
      include: {
        broker:      { select: { id: true, name: true } },
        attachments: { orderBy: { createdAt: 'desc' } },
      },
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.brokerExpense.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
