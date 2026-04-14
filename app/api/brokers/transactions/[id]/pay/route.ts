import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const paySchema = z.object({
  paymentMethod: z.enum(['DEBIT', 'CREDIT', 'E_TRANSFER', 'CHEQUE', 'CASH', 'OTHER']).optional(),
  paymentRef:    z.string().optional(),
}).optional();

// PATCH → mark PAID with optional payment method
export async function PATCH(request: NextRequest, { params }: { params: { id: string } }) {
  try {
    const body = await request.json().catch(() => ({}));
    const parsed = paySchema.safeParse(body);
    const paymentMethod = parsed.success && parsed.data?.paymentMethod ? parsed.data.paymentMethod : undefined;
    const paymentRef    = parsed.success && parsed.data?.paymentRef    ? parsed.data.paymentRef    : undefined;

    const tx = await prisma.brokerTransaction.update({
      where: { id: params.id },
      data: {
        status: 'PAID',
        paidDate: new Date(),
        ...(paymentMethod ? { paymentMethod } : {}),
        ...(paymentRef !== undefined ? { paymentRef } : {}),
      },
      include: { attachments: true },
    });
    return NextResponse.json(tx);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

// DELETE → mark PENDING (undo payment)
export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tx = await prisma.brokerTransaction.update({
      where: { id: params.id },
      data: { status: 'PENDING', paidDate: null, paymentMethod: null, paymentRef: '' },
      include: { attachments: true },
    });
    return NextResponse.json(tx);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
