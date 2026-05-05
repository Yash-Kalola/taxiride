export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import HallconClient from '@/components/hallcon/HallconClient';

export default async function HallconPage() {
  const [routes, trips] = await Promise.all([
    prisma.hallconRoute.findMany({
      include: { _count: { select: { trips: true } } },
      orderBy: { routeName: 'asc' },
    }),
    prisma.hallconTrip.findMany({
      include: { route: { select: { id: true, routeName: true, pickupLocation: true, dropoffLocation: true } } },
      orderBy: { date: 'desc' },
    }),
  ]);

  return (
    <div className="px-8 py-8 space-y-6">
      <HallconClient
        initialRoutes={JSON.parse(JSON.stringify(routes))}
        initialTrips={JSON.parse(JSON.stringify(trips))}
      />
    </div>
  );
}
