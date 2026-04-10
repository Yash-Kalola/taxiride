import { prisma } from '@/lib/db';
import MonthlyOverview from '@/components/overview/MonthlyOverview';

export const dynamic = 'force-dynamic';

export default async function OverviewPage() {
  let invoices: {
    id: string; invoiceNumber: number; month: string; year: number;
    total: number; flagged: boolean; verified: boolean; status: string;
    company: { id: string; companyName: string };
  }[] = [];
  let companies: { id: string; companyName: string }[] = [];

  try {
    [invoices, companies] = await Promise.all([
      prisma.invoice.findMany({
        select: {
          id: true, invoiceNumber: true, month: true, year: true,
          total: true, flagged: true, verified: true, status: true,
          company: { select: { id: true, companyName: true } },
        },
        orderBy: [{ year: 'desc' }, { createdAt: 'desc' }],
      }),
      prisma.company.findMany({
        select: { id: true, companyName: true },
        orderBy: { companyName: 'asc' },
      }),
    ]);
  } catch {}

  return (
    <div className="px-8 py-8">
      <MonthlyOverview invoices={invoices} companies={companies} />
    </div>
  );
}
