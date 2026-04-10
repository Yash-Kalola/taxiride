import { prisma } from '@/lib/db';
import TaxiCallerImport from '@/components/import/TaxiCallerImport';

export const dynamic = 'force-dynamic';

export default async function ImportPage() {
  let companies: { id: string; accountId: string; companyName: string }[] = [];
  try {
    companies = await prisma.company.findMany({
      select: { id: true, accountId: true, companyName: true },
      orderBy: { companyName: 'asc' },
    });
  } catch {}

  return (
    <div className="px-8 py-8">
      <TaxiCallerImport companies={companies} />
    </div>
  );
}
