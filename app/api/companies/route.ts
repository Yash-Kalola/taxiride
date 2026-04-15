import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const createSchema = z.object({
  accountId:            z.string().min(1),
  companyName:          z.string().min(1),
  contactName:          z.string().default(''),
  address:              z.string().default(''),
  poNumber:             z.string().default(''),
  expectedMonthlyRides: z.coerce.number().int().min(0).default(0),
  email:                z.string().email().or(z.literal('')).default(''),
});

export async function GET() {
  try {
    const companies = await prisma.company.findMany({
      orderBy: { companyName: 'asc' },
      include: { _count: { select: { rides: true, invoices: true } } },
    });
    return NextResponse.json(companies);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = createSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const company = await prisma.company.create({ data: parsed.data });
    return NextResponse.json(company, { status: 201 });
  } catch (err: any) {
    if (err?.code === 'P2002') return NextResponse.json({ error: 'Account ID already exists' }, { status: 409 });
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
