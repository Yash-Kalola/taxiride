import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const patchSchema = z.object({
  status:       z.enum(['DRAFT', 'PENDING', 'PAID']).optional(),
  flagged:      z.boolean().optional(),
  verified:     z.boolean().optional(),
  notes:        z.string().optional(),
  amountPreTax: z.number().optional(),
  hst:          z.number().optional(),
  total:        z.number().optional(),
  dateSent:     z.string().optional(),
  dueDate:      z.string().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const invoice = await prisma.invoice.findUnique({
      where: { id: params.id },
      include: {
        company: true,
        rides:   true,
      },
    });
    if (!invoice) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(invoice);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Delete all rides linked to this invoice, then delete the invoice
    await prisma.ride.deleteMany({ where: { invoiceId: params.id } });
    await prisma.invoice.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = patchSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const invoice = await prisma.invoice.update({
      where: { id: params.id },
      data: parsed.data,
      include: { company: true },
    });
    return NextResponse.json(invoice);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
