import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

const updateSchema = z.object({
  name:          z.string().min(1).optional(),
  phone:         z.string().optional(),
  licenseNumber: z.string().optional(),
  startDate:     z.string().optional(),
  endDate:       z.string().nullable().optional(),
  isActive:      z.boolean().optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const driver = await prisma.driver.findUnique({
      where: { id: params.id },
      include: {
        assignments: { orderBy: { startDate: 'desc' } },
        dailySheets: { orderBy: { date: 'desc' } },
        payouts:     { orderBy: [{ year: 'desc' }, { month: 'desc' }, { payoutPeriod: 'desc' }] },
      },
    });
    if (!driver) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(driver);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const fields = parsed.data;
  let parsedStart: Date | undefined;
  let parsedEnd:   Date | undefined;
  if (fields.startDate) {
    const d = parseLocalDate(fields.startDate);
    if (!d) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });
    parsedStart = d;
  }
  if (fields.endDate) {
    const d = parseLocalDate(fields.endDate);
    if (!d) return NextResponse.json({ error: 'Invalid end date' }, { status: 400 });
    parsedEnd = d;
  }

  try {
    const data: Record<string, unknown> = { ...fields };
    if (parsedStart) data.startDate = parsedStart;
    if (parsedEnd)   data.endDate   = parsedEnd;
    if (fields.endDate === null) data.endDate = null;

    // Deactivation: auto-set endDate and end active assignments
    if (fields.isActive === false) {
      const today = new Date();
      if (data.endDate === undefined) data.endDate = today;
      await prisma.vehicleAssignment.updateMany({
        where: { driverId: params.id, isActive: true },
        data:  { isActive: false, endDate: today },
      });
    }
    // Reactivation clears endDate unless explicitly provided
    if (fields.isActive === true && data.endDate === undefined) {
      data.endDate = null;
    }

    const driver = await prisma.driver.update({ where: { id: params.id }, data });
    return NextResponse.json(driver);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    await prisma.driver.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
