import { prisma } from '@/lib/db';
import PageHeader from '@/components/ui/PageHeader';
import CompaniesClient from '@/components/companies/CompaniesClient';

export const dynamic = 'force-dynamic';

export default async function CompaniesPage() {
  let companies: any[] = [];
  try {
    companies = await prisma.company.findMany({
      orderBy: { companyName: 'asc' },
      include: { _count: { select: { rides: true, invoices: true } } },
    });
  } catch {}

  return (
    <div className="px-8 py-8 space-y-6">
      <CompaniesClient initialCompanies={companies} />
    </div>
  );
}
