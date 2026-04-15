import { NextRequest, NextResponse } from 'next/server';
import { prisma } from '@/lib/db';

export async function GET(request: NextRequest) {
  const sp = request.nextUrl.searchParams;
  const where: Record<string, unknown> = {};
  if (sp.get('year')) {
    const y = parseInt(sp.get('year')!);
    if (!isNaN(y)) where.year = y;
  }
  if (sp.get('month'))     where.month     = sp.get('month');
  if (sp.get('companyId')) where.companyId  = sp.get('companyId');
  if (sp.get('status'))    where.status     = sp.get('status');

  try {
    const invoices = await prisma.invoice.findMany({
      where,
      include: { company: { select: { companyName: true, accountId: true, address: true, poNumber: true, email: true } } },
      orderBy: { invoiceNumber: 'desc' },
    });
    return NextResponse.json(invoices);
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
