import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  label:     z.string().trim().min(1).max(80).optional(),
  email:     z.string().trim().toLowerCase().email().max(160).optional(),
  isDefault: z.boolean().optional(),
});

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const updated = await prisma.$transaction(async (tx) => {
      if (parsed.data.isDefault) {
        await tx.emailSender.updateMany({
          where: { isDefault: true, NOT: { id: params.id } },
          data:  { isDefault: false },
        });
      }
      return tx.emailSender.update({ where: { id: params.id }, data: parsed.data });
    });
    return NextResponse.json(updated);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Another sender already uses that email' }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.emailSender.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
