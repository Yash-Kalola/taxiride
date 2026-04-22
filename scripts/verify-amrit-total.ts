import { prisma } from '@/lib/db';

async function main() {
  const amrit = await prisma.broker.findFirst({ where: { name: { contains: 'Amrit', mode: 'insensitive' } } });
  if (!amrit) { console.log('no amrit'); return; }
  const txs   = await prisma.brokerTransaction.findMany({ where: { brokerId: amrit.id, status: { not: 'VOID' } } });
  const exps  = await prisma.brokerExpense.findMany({ where: { brokerId: amrit.id } });
  const txTotal  = txs.filter((t) => t.type !== 'PAYOUT').reduce((a, t) => a + t.amount, 0);
  const expTotal = exps.reduce((a, e) => a + e.amount, 0);
  console.log('Amrit — BrokerTransactions (non-PAYOUT):', txTotal.toFixed(2));
  console.log('Amrit — BrokerExpenses:', expTotal.toFixed(2));
  console.log('Combined (what the card should show):', (txTotal + expTotal).toFixed(2));
}

main().catch(console.error).finally(() => prisma.$disconnect());
