import { formatCurrency } from '@/lib/tax';
import type { Invoice } from '@/lib/types';

export default function SummaryCards({ invoices }: { invoices: Invoice[] }) {
  const totalInvoiced = invoices.reduce((s, i) => s + i.total, 0);
  const totalReceived = invoices.filter((i) => i.status === 'Paid').reduce((s, i) => s + i.total, 0);
  const totalPending = invoices.filter((i) => i.status === 'Pending').reduce((s, i) => s + i.total, 0);

  const cards = [
    { label: 'Total Invoiced', value: totalInvoiced, count: invoices.length, color: 'border-l-gray-900' },
    { label: 'Total Received', value: totalReceived, count: invoices.filter((i) => i.status === 'Paid').length, color: 'border-l-green-500' },
    { label: 'Total Pending', value: totalPending, count: invoices.filter((i) => i.status === 'Pending').length, color: 'border-l-yellow-500' },
  ];

  return (
    <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
      {cards.map((card) => (
        <div key={card.label} className={`rounded-lg border border-gray-200 bg-white p-5 shadow-sm border-l-4 ${card.color}`}>
          <p className="text-xs font-medium uppercase tracking-wide text-gray-500">{card.label}</p>
          <p className="mt-1 text-2xl font-semibold text-gray-900">{formatCurrency(card.value)}</p>
          <p className="mt-1 text-sm text-gray-500">{card.count} invoice{card.count !== 1 ? 's' : ''}</p>
        </div>
      ))}
    </div>
  );
}
