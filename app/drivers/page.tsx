import { prisma } from '@/lib/db';
import DriversClient from '@/components/drivers/DriversClient';

export const dynamic = 'force-dynamic';

export default async function DriversPage() {
  let driversRaw: any[] = [];
  try {
    driversRaw = await prisma.driver.findMany({
      orderBy: [{ isActive: 'desc' }, { name: 'asc' }],
      include: {
        assignments: { where: { isActive: true }, orderBy: { startDate: 'desc' } },
      },
    });
  } catch {}

  const drivers = JSON.parse(JSON.stringify(driversRaw));

  return (
    <div className="px-8 py-8 space-y-6">
      <DriversClient initialDrivers={drivers} />
    </div>
  );
}
