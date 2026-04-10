import { prisma } from '@/lib/db';
import InvoicesClient from '@/components/dashboard/InvoicesClient';

export const dynamic = 'force-dynamic';

export default async function InvoicesPage() {
  let companies: any[] = [];
  let invoices: any[]  = [];
  try {
    [companies, invoices] = await Promise.all([
      prisma.company.findMany({ orderBy: { companyName: 'asc' } }),
      prisma.invoice.findMany({
        include: { company: { select: { companyName: true, accountId: true } } },
        orderBy: { invoiceNumber: 'desc' },
      }),
    ]);
  } catch {}

  return (
    <div className="px-8 py-8">
      <InvoicesClient initialInvoices={invoices} companies={companies} />
    </div>
  );
}
