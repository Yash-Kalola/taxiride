import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const payout = await prisma.driverPayout.findUnique({
      where: { id: params.id },
      include: { driver: { select: { id: true, name: true, phone: true } } },
    });
    if (!payout) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(payout);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.driverPayout.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
