import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';

const rowSchema = z.object({
  jobId:           z.string().default(''),
  vehicleNumber:   z.string().default(''),
  pickupLocation:  z.string().default(''),
  dropoffLocation: z.string().default(''),
  passenger:       z.string().default(''),
  driver:          z.string().default(''),
  dateTime:        z.string().default(''),
  amount:          z.coerce.number().min(0),
});

const bodySchema = z.object({
  companyId: z.string().min(1),
  month:     z.string().min(1),
  year:      z.coerce.number().int(),
  rows:      z.array(rowSchema).min(1),
});

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { companyId, month, year, rows } = parsed.data;

  try {
    const company = await prisma.company.findUnique({ where: { id: companyId } });
    if (!company) return NextResponse.json({ error: 'Company not found' }, { status: 404 });

    // Dedup: find existing jobIds for this company/month/year to skip duplicates
    const incomingJobIds = rows.map(r => r.jobId).filter(Boolean);
    let existingJobIds = new Set<string>();
    if (incomingJobIds.length > 0) {
      const existing = await prisma.ride.findMany({
        where: { companyId, month, year, jobId: { in: incomingJobIds } },
        select: { jobId: true },
      });
      existingJobIds = new Set(existing.map(r => r.jobId));
    }

    const newRows = rows.filter(r => !r.jobId || !existingJobIds.has(r.jobId));
    const skipped = rows.length - newRows.length;

    if (newRows.length === 0) {
      return NextResponse.json({ imported: 0, skipped, error: 'All rides already imported.' }, { status: 200 });
    }

    const result = await prisma.ride.createMany({
      data: newRows.map((row) => ({ ...row, companyId, month, year })),
    });

    return NextResponse.json({ imported: result.count, skipped }, { status: 201 });
  } catch (err) {
    console.error(err);
    return NextResponse.json({ error: 'Server error' }, { status: 500 });
  }
}
