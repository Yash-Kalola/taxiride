import { prisma } from '@/lib/db';
import PayoutsClient from '@/components/payouts/PayoutsClient';
import { findUnifiedPayouts } from '@/lib/payout-virtual';

export const dynamic = 'force-dynamic';

export default async function PayoutsPage() {
  const today = new Date();
  const month = today.getMonth() + 1;
  const year  = today.getFullYear();

  // Default filter on the client: DRAFT + current month. Include virtual rows
  // so every active driver with sheets in this month shows up, even if they
  // don't yet have a persisted DriverPayout record.
  const [rows, driversRaw] = await Promise.all([
    findUnifiedPayouts({ month, year, status: 'DRAFT', includeVirtual: true }).catch(() => []),
    prisma.driver.findMany({
      where: { isActive: true }, orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }).catch(() => []),
  ]);

  return (
    <div className="px-8 py-8 space-y-6">
      <PayoutsClient
        initialPayouts={JSON.parse(JSON.stringify(rows))}
        drivers={driversRaw}
        initialMonth={month}
        initialYear={year}
      />
    </div>
  );
}
