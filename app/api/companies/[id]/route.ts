import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const updateSchema = z.object({
  accountId:            z.string().min(1).optional(),
  companyName:          z.string().min(1).optional(),
  contactName:          z.string().optional(),
  address:              z.string().optional(),
  poNumber:             z.string().optional(),
  expectedMonthlyRides: z.coerce.number().int().min(0).optional(),
  email:                z.string().email().or(z.literal('')).optional(),
});

export async function GET(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    const company = await prisma.company.findUnique({
      where: { id: params.id },
      include: { _count: { select: { rides: true, invoices: true } } },
    });
    if (!company) return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json(company);
  } catch (err) {
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function PUT(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = updateSchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  try {
    const company = await prisma.company.update({ where: { id: params.id }, data: parsed.data });
    return NextResponse.json(company);
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}

export async function DELETE(_: NextRequest, { params }: { params: { id: string } }) {
  try {
    // Must delete invoices first (Invoice→Company has no onDelete cascade)
    // First unlink rides from invoices, then delete invoices, then delete company (rides cascade)
    const invoices = await prisma.invoice.findMany({ where: { companyId: params.id }, select: { id: true } });
    if (invoices.length > 0) {
      const invoiceIds = invoices.map((i) => i.id);
      await prisma.ride.updateMany({ where: { invoiceId: { in: invoiceIds } }, data: { invoiceId: null } });
      await prisma.invoice.deleteMany({ where: { companyId: params.id } });
    }
    await prisma.company.delete({ where: { id: params.id } });
    return new NextResponse(null, { status: 204 });
  } catch (err: any) {
    if (err?.code === 'P2025') return NextResponse.json({ error: 'Not found' }, { status: 404 });
    return NextResponse.json({ error: String(err) }, { status: 500 });
  }
}
