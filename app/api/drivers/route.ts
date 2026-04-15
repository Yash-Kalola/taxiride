import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { parseLocalDate } from '@/lib/dates';

const createSchema = z.object({
  name:          z.string().min(1),
  phone:         z.string().default(''),
  licenseNumber: z.string().default(''),
  startDate:     z.string().min(1),
});

export async function GET() {
  try {
    const drivers = await prisma.driver.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        assignments: {
          where: { isActive: true },
          orderBy: { startDate: 'desc' },
        },
      },
    });
    return NextResponse.json(drivers);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const startDate = parseLocalDate(parsed.data.startDate);
  if (!startDate) return NextResponse.json({ error: 'Invalid start date' }, { status: 400 });

  try {
    const driver = await prisma.driver.create({
      data: {
        name:          parsed.data.name,
        phone:         parsed.data.phone,
        licenseNumber: parsed.data.licenseNumber,
        startDate,
        isActive:      true,
      },
    });
    return NextResponse.json(driver, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
