import { clsx } from 'clsx';

type BadgeVariant = 'paid' | 'pending' | 'draft' | 'flagged' | 'overdue';

const styles: Record<BadgeVariant, string> = {
  paid:    'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  pending: 'bg-amber-50   text-amber-700   ring-1 ring-amber-600/20',
  draft:   'bg-slate-100  text-slate-600   ring-1 ring-slate-500/20',
  flagged: 'bg-red-50     text-red-700     ring-1 ring-red-600/20',
  overdue: 'bg-orange-50  text-orange-700  ring-1 ring-orange-600/20',
};

const labels: Record<BadgeVariant, string> = {
  paid:    'Paid',
  pending: 'Pending',
  draft:   'Draft',
  flagged: 'Flagged',
  overdue: 'Overdue',
};

export default function Badge({ variant, className }: { variant: BadgeVariant; className?: string }) {
  return (
    <span className={clsx(
      'inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium',
      styles[variant],
      className
    )}>
      {labels[variant]}
    </span>
  );
}
