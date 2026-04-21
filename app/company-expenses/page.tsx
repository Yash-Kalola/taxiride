import { prisma } from '@/lib/db';
import CompanyExpensesClient from '@/components/expenses/CompanyExpensesClient';

export const dynamic = 'force-dynamic';

export default async function CompanyExpensesPage() {
  const today = new Date();
  let expenses: any[] = [];
  let companyCabs: { cabNumber: string }[] = [];

  try {
    [expenses, companyCabs] = await Promise.all([
      prisma.companyExpense.findMany({
        where:   { month: today.getMonth() + 1, year: today.getFullYear() },
        orderBy: { date: 'desc' },
        include: { attachments: { orderBy: { createdAt: 'desc' } } },
      }),
      prisma.brokerVehicle.findMany({
        where: { isCompanyCar: true, isActive: true },
        select: { cabNumber: true },
        orderBy: { cabNumber: 'asc' },
      }),
    ]);
  } catch {}

  return (
    <div className="px-8 py-8 space-y-6">
      <CompanyExpensesClient
        initialExpenses={JSON.parse(JSON.stringify(expenses))}
        companyCabs={companyCabs.map((v) => v.cabNumber)}
        initialMonth={today.getMonth() + 1}
        initialYear={today.getFullYear()}
      />
    </div>
  );
}
