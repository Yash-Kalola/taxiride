/**
 * Read-only diagnostic for the Broker Profit card on the dashboard.
 * Shows every BrokerTransaction that feeds into the current-month total,
 * grouped by broker + type, so we can reconcile Yash's expected vs shown.
 */
import { prisma } from '@/lib/db';

async function main() {
  const now = new Date();
  const month = now.getMonth() + 1;
  const year  = now.getFullYear();
  console.log(`Broker transactions for ${month}/${year} (excl. VOID):\n`);

  const txs = await prisma.brokerTransaction.findMany({
    where:   { month, year, status: { not: 'VOID' } },
    orderBy: [{ brokerId: 'asc' }, { type: 'asc' }, { createdAt: 'asc' }],
    include: { broker: { select: { name: true } } },
  });

  const byBroker = new Map<string, typeof txs>();
  for (const t of txs) {
    const arr = byBroker.get(t.broker.name) ?? [];
    arr.push(t);
    byBroker.set(t.broker.name, arr);
  }

  let grandInflow = 0, grandPaid = 0, grandPending = 0, grandOutflow = 0;
  for (const [name, rows] of byBroker) {
    console.log(`── ${name} ──────────────────────────────────`);
    let brokerInflow = 0, brokerOutflow = 0;
    for (const t of rows) {
      const sign = t.type === 'PAYOUT' ? '-' : '+';
      console.log(
        `  ${t.type.padEnd(15)} ${t.status.padEnd(7)} ${sign}$${t.amount.toFixed(2).padStart(10)}  ${t.description}`
      );
      if (t.type === 'PAYOUT') brokerOutflow += t.amount;
      else                     brokerInflow  += t.amount;
      if (t.type !== 'PAYOUT') {
        if (t.status === 'PAID') grandPaid += t.amount;
        else                      grandPending += t.amount;
      } else {
        grandOutflow += t.amount;
      }
    }
    console.log(`  subtotal: inflow +$${brokerInflow.toFixed(2)}  outflow -$${brokerOutflow.toFixed(2)}  net $${(brokerInflow - brokerOutflow).toFixed(2)}\n`);
    grandInflow += brokerInflow;
  }

  console.log('─'.repeat(60));
  console.log(`Total inflow  (non-PAYOUT, any status):  $${grandInflow.toFixed(2)}`);
  console.log(`  ├── PAID:    $${grandPaid.toFixed(2)}`);
  console.log(`  └── PENDING: $${grandPending.toFixed(2)}`);
  console.log(`Total outflow (PAYOUT):                  $${grandOutflow.toFixed(2)}`);
  console.log(`Net (what the dashboard shows):          $${(grandInflow - grandOutflow).toFixed(2)}`);
}

main()
  .catch((err) => { console.error(err); process.exitCode = 1; })
  .finally(() => prisma.$disconnect());
