'use client';
import { clsx } from 'clsx';
import Badge from '@/components/ui/Badge';
import Button from '@/components/ui/Button';
import { formatCurrency } from '@/lib/tax';
import type { Invoice } from '@/lib/types';

interface InvoiceRowProps {
  invoice: Invoice;
  onMarkPaid: (inv: Invoice) => void;
  onMarkUnpaid: (inv: Invoice) => void;
  onUnflag: (inv: Invoice) => void;
  onFlag: (inv: Invoice) => void;
  onResend: (inv: Invoice) => void;
}

export default function InvoiceRow({ invoice, onMarkPaid, onMarkUnpaid, onUnflag, onFlag, onResend }: InvoiceRowProps) {
  const isFlaggedUnverified = invoice.flagged && !invoice.verified;
  const isOverdue = invoice.status === 'Pending' && invoice.dueDate < new Date().toISOString().split('T')[0];

  return (
    <tr className={clsx(
      'border-b border-gray-100',
      isFlaggedUnverified && 'bg-red-50 border-l-4 border-l-red-500',
      !isFlaggedUnverified && isOverdue && 'border-l-4 border-l-orange-400'
    )}>
      <td className="px-4 py-3 text-sm font-medium text-gray-900">{invoice.companyName}</td>
      <td className="px-4 py-3 text-sm text-gray-600 font-mono">#{invoice.invoiceNumber}</td>
      <td className="px-4 py-3 text-sm text-gray-900">{formatCurrency(invoice.total)}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{invoice.dateSent || '—'}</td>
      <td className="px-4 py-3 text-sm text-gray-500">{invoice.dueDate || '—'}</td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5">
          <Badge variant={invoice.status === 'Paid' ? 'paid' : isOverdue ? 'overdue' : 'pending'} />
          {isFlaggedUnverified && <Badge variant="flagged" />}
        </div>
      </td>
      <td className="px-4 py-3">
        <div className="flex items-center gap-1.5 flex-wrap">
          <Button
            size="sm"
            variant="ghost"
            onClick={() => window.open(`/api/invoices/${invoice.invoiceNumber}/pdf`, '_blank')}
          >
            View PDF
          </Button>
          <Button size="sm" variant="ghost" onClick={() => onResend(invoice)}>
            Resend
          </Button>
          {invoice.status === 'Pending' ? (
            <Button size="sm" variant="secondary" onClick={() => onMarkPaid(invoice)}>
              Mark Paid
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onMarkUnpaid(invoice)}>
              Mark Unpaid
            </Button>
          )}
          {isFlaggedUnverified ? (
            <Button size="sm" variant="ghost" onClick={() => onUnflag(invoice)}>
              Unflag
            </Button>
          ) : (
            <Button size="sm" variant="ghost" onClick={() => onFlag(invoice)}>
              Flag
            </Button>
          )}
        </div>
      </td>
    </tr>
  );
}
