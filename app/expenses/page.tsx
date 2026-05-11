import { prisma } from '@/lib/db';
import ExpensesClient from '@/components/expenses/ExpensesClient';

export const dynamic = 'force-dynamic';

export default async function ExpensesPage({ searchParams }: { searchParams: { broker?: string } }) {
  let expenses: any[] = [];
  let brokers: any[]  = [];
  const initialBroker = searchParams?.broker ?? '';

  try {
    [expenses, brokers] = await Promise.all([
      prisma.brokerExpense.findMany({
        orderBy: { date: 'desc' },
        include: {
          broker: { select: { id: true, name: true } },
          // Explicit select to exclude `fileData` Bytes column (would bloat the response on every page load)
          attachments: {
            orderBy: { createdAt: 'desc' },
            select: { id: true, expenseId: true, label: true, fileName: true, filePath: true, fileType: true, fileSize: true, createdAt: true },
          },
        },
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
        initialBroker={initialBroker}
      />
    </div>
  );
}
