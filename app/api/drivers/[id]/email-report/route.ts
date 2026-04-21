import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { prisma } from '@/lib/db';
import { renderDriverReportPDF, DriverReportSheet } from '@/lib/driver-report-pdf';
import { sendEmailWithPDF } from '@/lib/email';
import { MONTHS, SENDER } from '@/lib/constants';
import { getCurrentSession } from '@/lib/auth';

const schema = z.object({
  month:          z.number().int().min(1).max(12),
  year:           z.number().int().min(2000).max(3000),
  to:             z.string().trim().toLowerCase().email(),
  from:           z.string().trim().toLowerCase().email(),
  subject:        z.string().trim().max(300).optional(),
  message:        z.string().trim().max(4000).optional(),
});

export async function POST(request: NextRequest, { params }: { params: { id: string } }) {
  const body = await request.json().catch(() => null);
  const parsed = schema.safeParse(body);
  if (!parsed.success) return NextResponse.json({ error: parsed.error.flatten() }, { status: 400 });

  const { month, year, to, from, subject: subjectOverride, message } = parsed.data;
  const sess = await getCurrentSession();

  try {
    const driver = await prisma.driver.findUnique({
      where:  { id: params.id },
      select: { id: true, name: true, phone: true, licenseNumber: true },
    });
    if (!driver) return NextResponse.json({ error: 'Driver not found' }, { status: 404 });

    const sheetsRaw = await prisma.dailySheet.findMany({
      where:   { driverId: driver.id, month, year },
      orderBy: [{ payoutPeriod: 'asc' }, { date: 'asc' }, { shift: 'asc' }],
    });

    const sheets: DriverReportSheet[] = sheetsRaw.map((s) => ({
      date:          s.date.toISOString(),
      shift:         s.shift as 'MORNING' | 'EVENING',
      vehicleNumber: s.vehicleNumber,
      payoutPeriod:  s.payoutPeriod,
      driverPay:     s.companyNet ?? 0,
      isPaid:        s.isPaid,
    }));

    const pdfBuffer = await renderDriverReportPDF({
      driverName:    driver.name,
      driverPhone:   driver.phone          || undefined,
      licenseNumber: driver.licenseNumber  || undefined,
      month,
      year,
      sheets,
    });

    const monthName = MONTHS[month - 1];
    const subject   = subjectOverride || `Monthly Driver Report — ${monthName} ${year}`;
    const body      = (message && message.trim()) || `Hello ${driver.name},\n\nPlease find your monthly driver report for ${monthName} ${year} attached.\n\n${SENDER.name}`;
    const html      = `<p>${body.replace(/\n{2,}/g, '</p><p>').replace(/\n/g, '<br/>')}</p>`;

    let status: 'SENT' | 'FAILED' = 'SENT';
    let errorMsg = '';
    try {
      await sendEmailWithPDF({
        to, from, subject, html, text: body,
        pdfBuffer,
        pdfFilename: `DriverReport-${driver.name.replace(/[^a-zA-Z0-9]/g, '-')}-${monthName}-${year}.pdf`,
      });
    } catch (err: any) {
      status = 'FAILED';
      errorMsg = err?.message || 'Email send failed';
    }

    const log = await prisma.emailLog.create({
      data: {
        recipientType:  'DRIVER',
        recipientId:    driver.id,
        recipientEmail: to,
        fromAddress:    from,
        subject,
        month, year,
        sentById:       sess?.uid ?? null,
        status,
        error:          errorMsg,
      },
    });

    if (status === 'FAILED') {
      return NextResponse.json({ error: errorMsg || 'Send failed', log }, { status: 502 });
    }
    return NextResponse.json({ ok: true, log });
  } catch (err: any) {
    console.error(err);
    return NextResponse.json({ error: err?.message || 'Server error' }, { status: 500 });
  }
}
