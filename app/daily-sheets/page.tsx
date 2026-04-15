import { prisma } from '@/lib/db';
import DailySheetsClient from '@/components/daily-sheets/DailySheetsClient';

export const dynamic = 'force-dynamic';

export default async function DailySheetsPage() {
  const today = new Date();
  const [sheetsRaw, driversRaw, vehicleNumbersRaw] = await Promise.all([
    prisma.dailySheet.findMany({
      where: { month: today.getMonth() + 1, year: today.getFullYear() },
      orderBy: [{ date: 'desc' }, { shift: 'asc' }],
      include: { driver: { select: { id: true, name: true } } },
    }).catch(() => []),
    prisma.driver.findMany({
      where: { isActive: true }, orderBy: { name: 'asc' },
      select: { id: true, name: true },
    }).catch(() => []),
    prisma.dailySheet.findMany({
      distinct: ['vehicleNumber'],
      select: { vehicleNumber: true },
    }).catch(() => []),
  ]);

  const sheets = JSON.parse(JSON.stringify(sheetsRaw));
  const vehicleNumbers = Array.from(new Set(vehicleNumbersRaw.map((x) => x.vehicleNumber).filter(Boolean)))
    .sort((a, b) => {
      const na = parseInt(a); const nb = parseInt(b);
      if (!isNaN(na) && !isNaN(nb) && na !== nb) return na - nb;
      return a.localeCompare(b);
    });

  return (
    <div className="px-8 py-8 space-y-6">
      <DailySheetsClient
        initialSheets={sheets}
        drivers={driversRaw}
        initialVehicleNumbers={vehicleNumbers}
        initialMonth={today.getMonth() + 1}
        initialYear={today.getFullYear()}
      />
    </div>
  );
}
