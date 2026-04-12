import { prisma } from '@/lib/db';
import ExpensesClient from '@/components/expenses/ExpensesClient';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage() {
  let expenses: any[] = [];
  let brokers: any[]  = [];

  try {
    [expenses, brokers] = await Promise.all([
      prisma.brokerExpense.findMany({
        orderBy: { date: 'desc' },
        include: { broker: { select: { id: true, name: true } }, attachments: { orderBy: { createdAt: 'desc' } } },
      }),
      prisma.broker.findMany({
        where:   { isActive: true },
        orderBy: { name: 'asc' },
        include: { vehicles: { where: { isActive: true }, select: { id: true, cabNumber: true } } },
      }),
    ]);
  } catch {}

  return (
    <div className="px-8 py-8 space-y-6">
      <ExpensesClient
        initialExpenses={JSON.parse(JSON.stringify(expenses))}
        brokers={JSON.parse(JSON.stringify(brokers))}
      />
    </div>
  );
}
