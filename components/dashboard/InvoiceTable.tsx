import InvoiceRow from './InvoiceRow';
import type { Invoice } from '@/lib/types';

interface InvoiceTableProps {
  invoices: Invoice[];
  onMarkPaid: (inv: Invoice) => void;
  onMarkUnpaid: (inv: Invoice) => void;
  onUnflag: (inv: Invoice) => void;
  onFlag: (inv: Invoice) => void;
  onResend: (inv: Invoice) => void;
}

export default function InvoiceTable({ invoices, onMarkPaid, onMarkUnpaid, onUnflag, onFlag, onResend }: InvoiceTableProps) {
  if (invoices.length === 0) {
    return (
      <div className="rounded-lg border border-gray-200 bg-white py-16 text-center text-gray-400">
        No invoices found for the selected filters.
      </div>
    );
  }

  return (
    <div className="overflow-x-auto rounded-lg border border-gray-200 bg-white shadow-sm">
      <table className="w-full text-left">
        <thead>
          <tr className="border-b border-gray-200 bg-gray-50">
            {['Company', 'Invoice #', 'Amount', 'Date Sent', 'Due Date', 'Status', 'Actions'].map((h) => (
              <th key={h} className="px-4 py-3 text-xs font-semibold uppercase tracking-wide text-gray-500">
                {h}
              </th>
            ))}
          </tr>
        </thead>
        <tbody>
          {invoices.map((inv) => (
            <InvoiceRow
              key={inv.invoiceNumber}
              invoice={inv}
              onMarkPaid={onMarkPaid}
              onMarkUnpaid={onMarkUnpaid}
              onUnflag={onUnflag}
              onFlag={onFlag}
              onResend={onResend}
            />
          ))}
        </tbody>
      </table>
    </div>
  );
}
