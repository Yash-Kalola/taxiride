/**
 * One-off: delete every Invoice row.
 * Rides are preserved — Ride.invoiceId is SetNull, so underlying ride
 * data stays and just becomes un-invoiced (available to re-invoice).
 *
 * Run: npx tsx scripts/delete-all-invoices.ts
 */
import { prisma } from '../lib/db';

async function main() {
  const before = await prisma.invoice.count();
  console.log(`Invoices in DB before: ${before}`);

  if (before === 0) {
    console.log('Nothing to delete.');
    return;
  }

  const { count } = await prisma.invoice.deleteMany({});
  console.log(`Deleted ${count} invoice${count !== 1 ? 's' : ''}.`);

  const after = await prisma.invoice.count();
  const orphanedRides = await prisma.ride.count({ where: { invoiceId: null } });
  console.log(`Invoices remaining: ${after}`);
  console.log(`Rides now un-invoiced (invoiceId = null): ${orphanedRides}`);
}

main()
  .then(() => prisma.$disconnect())
  .catch(async (err) => {
    console.error(err);
    await prisma.$disconnect();
    process.exit(1);
  });
