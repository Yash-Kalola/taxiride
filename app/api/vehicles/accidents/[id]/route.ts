import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

const updateSchema = z.object({
  date:             z.string().optional(),
  incidentNumber:   z.string().optional(),
  claimNumber:      z.string().optional(),
  driver:           z.string().optional(),
  settlementAmount: z.coerce.number().nullable().optional(),
  notes:            z.string().optional(),
});

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  let parsedDate: Date | undefined;
  if (parsed.data.date) {
    const d = parseLocalDate(parsed.data.date);
    if (!d) return NextResponse.json({ error: 'Invalid date' }, { status: 400 });
    parsedDate = d;
  }

  try {
    const data: Record<string, unknown> = { ...parsed.data };
    if (parsedDate) data.date = parsedDate;

    const accident = await prisma.vehicleAccident.update({ where: { id: params.id }, data });
    return NextResponse.json(accident);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.vehicleAccident.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
