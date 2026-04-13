import { prisma } from '@/lib/db';
import BrokerOverview from '@/components/brokers/BrokerOverview';
import { subMonths, format } from 'date-fns';

export const dynamic = 'force-dynamic';

export default async function BrokerOverviewPage() {
  // Last 6 months (inclusive of current)
  const now = new Date();
  const months: { label: string; month: number; year: number; key: string }[] = [];
  for (let i = 5; i >= 0; i--) {
    const d = subMonths(now, i);
    months.push({
      label: format(d, 'MMM yyyy'),
      month: d.getMonth() + 1,
      year:  d.getFullYear(),
      key:   `${d.getFullYear()}-${String(d.getMonth() + 1).padStart(2, '0')}`,
    });
  }

  let brokersRaw: any[] = [];
  try {
    brokersRaw = await prisma.broker.findMany({
      orderBy: { name: 'asc' },
      include: {
        transactions: {
          where: { OR: months.map((m) => ({ month: m.month, year: m.year })), status: { not: 'VOID' } },
          select: { type: true, amount: true, month: true, year: true, status: true },
        },
        vehicles: { where: { isActive: true }, select: { cabNumber: true, isCompanyCar: true } },
        expenses: { select: { amount: true, date: true, paid: true } },
      },
    });
  } catch {}

  // Serialize dates for client component
  const brokers = JSON.parse(JSON.stringify(brokersRaw));

  return (
    <div className="px-8 py-8">
      <BrokerOverview brokers={brokers} months={months} />
    </div>
  );
}
