export const dynamic = 'force-dynamic';

import { prisma } from '@/lib/db';
import PartyClient from '@/components/party/PartyClient';

export default async function PartyPage() {
  const [bookings, companies] = await Promise.all([
    prisma.partyBooking.findMany({
      include: { company: { select: { id: true, companyName: true } } },
      orderBy: { eventDate: 'desc' },
    }),
    prisma.company.findMany({
      select: { id: true, companyName: true },
      orderBy: { companyName: 'asc' },
    }),
  ]);

  return (
    <div className="px-8 py-8 space-y-6">
      <PartyClient
        initialBookings={JSON.parse(JSON.stringify(bookings))}
        companies={companies}
      />
    </div>
  );
}
