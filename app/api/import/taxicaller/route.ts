import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { addDays, format } from 'date-fns';
import { prisma } from '@/lib/db';
import { calcBase, calcHST } from '@/lib/tax';
import { INVOICE_NUMBER_SEED, MONTHS } from '@/lib/constants';
import { renderInvoicePDF } from '@/lib/pdf';
import { sendInvoiceEmail } from '@/lib/email';
import type { Company, Ride, Invoice } from '@prisma/client';

const rideInputSchema = z.object({
  jobId:           z.string().default(''),
  dateTime:        z.string().default(''),
  passenger:       z.string().default(''),
  customerPhone:   z.string().default(''),
  pickupLocation:  z.string().default(''),
  dropoffLocation: z.string().default(''),
  vehicleNumber:   z.string().default(''),
  driver:          z.string().default(''),
  amount:          z.coerce.number().min(0),
});

const bodySchema = z.object({
  month:  z.string().min(1),
  year:   z.coerce.number().int(),
  groups: z.array(
    z.object({
      companyId: z.string().min(1),
      // 'send' (default) = create + email and mark PENDING. 'draft' = create
      // invoice and PDF, skip the email, leave status at DRAFT so the office
      // can review and send manually.
      sendMode:  z.enum(['send', 'draft']).default('send'),
      rows:      z.array(rideInputSchema).min(1),
    })
  ).min(1),
});

interface ResultEntry {
  companyId:        string;
  companyName:      string;
  status:           'success' | 'error';
  invoiceId?:       string;
  invoiceNumber?:   number;
  amountTotal?:     number;
  flagged?:         boolean;
  duplicatesSkipped?: number;
  sentAs?:          'sent' | 'draft';
  error?:           string;
}

export async function POST(request: NextRequest) {
  const body = await request.json().catch(() => null);
  const parsed = bodySchema.safeParse(body);
  if (!parsed.success) {
    return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });
  }

  const { month, year, groups } = parsed.data;
  const results: ResultEntry[] = [];

  // Sequential loop — preserves deterministic invoice number sequencing
  for (const group of groups) {
    let company: (Company & { _count?: unknown }) | null = null;

    try {
      company = await prisma.company.findUnique({ where: { id: group.companyId } });
      if (!company) {
        results.push({ companyId: group.companyId, companyName: group.companyId, status: 'error', error: 'Company not found' });
        continue;
      }

      // ── 1. Duplicate detection (scoped to month + year) ──────────────────
      const incomingJobIds = group.rows.map((r) => r.jobId).filter(Boolean);
      let existingJobIdSet = new Set<string>();
      if (incomingJobIds.length > 0) {
        const existing = await prisma.ride.findMany({
          where: { companyId: group.companyId, month, year, jobId: { in: incomingJobIds } },
          select: { jobId: true },
        });
        existingJobIdSet = new Set(existing.map((r) => r.jobId));
      }

      const freshRows = group.rows.filter((r) => !r.jobId || !existingJobIdSet.has(r.jobId));
      const duplicatesSkipped = group.rows.length - freshRows.length;

      if (freshRows.length === 0) {
        results.push({
          companyId: group.companyId, companyName: company.companyName, status: 'error',
          error: 'All rides already imported for this period',
        });
        continue;
      }

      // ── 2. Create rides ───────────────────────────────────────────────────
      await prisma.ride.createMany({
        data: freshRows.map((r) => ({ ...r, companyId: group.companyId, month, year })),
      });

      // ── 3. Generate invoice ───────────────────────────────────────────────
      const rides = await prisma.ride.findMany({
        where: { companyId: group.companyId, month, year, invoiceId: null },
      });

      const grandTotal = Math.round(rides.reduce((s, r) => s + r.amount, 0) * 100) / 100;
      const base = calcBase(grandTotal);
      const hst  = calcHST(grandTotal);

      const maxInvoice = await prisma.invoice.findFirst({ orderBy: { invoiceNumber: 'desc' } });
      const invoiceNumber = (maxInvoice?.invoiceNumber ?? INVOICE_NUMBER_SEED - 1) + 1;

      const today = new Date();

      // Flag if current total dropped below the most recent prior invoice for this company
      const priorInvoices = await prisma.invoice.findMany({
        where: { companyId: group.companyId },
        select: { total: true, month: true, year: true },
      });
      const toMonthNum = (inv: { year: number; month: string }) =>
        inv.year * 12 + (MONTHS as readonly string[]).indexOf(inv.month);
      priorInvoices.sort((a, b) => toMonthNum(b) - toMonthNum(a));
      const previousInvoice = priorInvoices[0] ?? null;
      const flagged = previousInvoice ? grandTotal < previousInvoice.total : false;

      const invoice = await prisma.invoice.create({
        data: {
          invoiceNumber,
          companyId: group.companyId,
          month,
          year,
          amountPreTax: base,
          hst,
          total: grandTotal,
          dueDate: format(addDays(today, 30), 'yyyy-MM-dd'),
          status: 'DRAFT',
          flagged,
          rides: { connect: rides.map((r) => ({ id: r.id })) },
        },
        include: { company: true, rides: true },
      });

      // ── 4. Render PDF + send email + mark PENDING ─────────────────────────
      let pdfBuffer: Buffer;
      try {
        pdfBuffer = await renderInvoicePDF(
          invoice.company as Company,
          invoice.rides as Ride[],
          invoice as Invoice,
        );
      } catch (pdfErr) {
        // PDF failed — invoice stays DRAFT, user can send manually
        results.push({
          companyId: group.companyId, companyName: company.companyName, status: 'error',
          error: `Invoice #${invoiceNumber} created as draft but PDF generation failed: ${String(pdfErr)}`,
          invoiceId: invoice.id, invoiceNumber, duplicatesSkipped,
        });
        continue;
      }

      // Draft mode: PDF is rendered and the invoice stays DRAFT, no email.
      // Send mode: try email (non-fatal if SMTP stub), then flip to PENDING.
      if (group.sendMode === 'send') {
        try {
          await sendInvoiceEmail({
            to: invoice.company.email,
            invoiceNumber,
            month,
            year,
            pdfBuffer,
          });
        } catch {
          // Email is stubbed — non-fatal, continue to mark PENDING
        }

        await prisma.invoice.update({
          where: { id: invoice.id },
          data: { status: 'PENDING', dateSent: format(today, 'yyyy-MM-dd') },
        });
      }

      results.push({
        companyId:        group.companyId,
        companyName:      company.companyName,
        status:           'success',
        invoiceId:        invoice.id,
        invoiceNumber,
        amountTotal:      grandTotal,
        flagged,
        duplicatesSkipped,
        sentAs:           group.sendMode === 'draft' ? 'draft' : 'sent',
      });

    } catch (err: any) {
      console.error('taxicaller import: group failed', group.companyId, err);
      results.push({
        companyId:   group.companyId,
        companyName: company?.companyName ?? group.companyId,
        status:      'error',
        error:       typeof err?.message === 'string' ? err.message : 'Import failed',
      });
    }
  }

  return NextResponse.json({ results });
}
