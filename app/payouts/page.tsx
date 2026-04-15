import { prisma } from '@/lib/db';
import PayoutsClient from '@/components/payouts/PayoutsClient';

export const dynamic = 'force-dynamic';

export default async function PayoutsPage() {
  const today = new Date();
  const [payoutsRaw, driversRaw] = await Promise.all([
    prisma.driverPayout.findMany({
      where: { month: today.getMonth() + 1, year: today.getFullYear() },
      orderBy: [{ payoutPeriod: 'asc' }, { createdAt: 'desc' }],
      include: { driver: { select: { id: true, name: true } } },
    }).catch(() => []),
    prisma.driver.findMany({
      where: { isActive: true }, orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }).catch(() => []),
  ]);

  const payouts = JSON.parse(JSON.stringify(payoutsRaw));

  return (
    <div className="px-8 py-8 space-y-6">
      <PayoutsClient
        initialPayouts={payouts}
        drivers={driversRaw}
        initialMonth={today.getMonth() + 1}
        initialYear={today.getFullYear()}
      />
    </div>
  );
}
