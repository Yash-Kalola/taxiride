import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

// PATCH → mark PAID, DELETE → mark PENDING (undo)
export async function PATCH(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tx = await prisma.brokerTransaction.update({
      where: { id: params.id },
      data:  { status: 'PAID', paidDate: new Date() },
    });
    return NextResponse.json(tx);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const tx = await prisma.brokerTransaction.update({
      where: { id: params.id },
      data:  { status: 'PENDING', paidDate: null },
    });
    return NextResponse.json(tx);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
