import { prisma } from '@/lib/db';
import RidesClient from '@/components/rides/RidesClient';

export const dynamic = 'force-dynamic';

export default async function RidesPage() {
  let companies: any[] = [];
  let rides: any[] = [];
  try {
    [companies, rides] = await Promise.all([
      prisma.company.findMany({ orderBy: { companyName: 'asc' } }),
      prisma.ride.findMany({
        include: { company: { select: { companyName: true, accountId: true } } },
        orderBy: { createdAt: 'desc' },
        take: 200,
      }),
    ]);
  } catch {}

  return (
    <div className="px-8 py-8">
      <RidesClient initialRides={rides} companies={companies} />
    </div>
  );
}
