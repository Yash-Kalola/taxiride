import { clsx } from 'clsx';

type BadgeVariant =
  | 'paid' | 'pending' | 'draft' | 'flagged' | 'overdue'
  | 'active' | 'inactive' | 'void'
  | 'morning' | 'evening';

const styles: Record<BadgeVariant, string> = {
  paid:     'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  pending:  'bg-amber-50   text-amber-700   ring-1 ring-amber-600/20',
  draft:    'bg-slate-100  text-slate-600   ring-1 ring-slate-500/20',
  flagged:  'bg-red-50     text-red-700     ring-1 ring-red-600/20',
  overdue:  'bg-orange-50  text-orange-700  ring-1 ring-orange-600/20',
  active:   'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-600/20',
  inactive: 'bg-gray-100   text-gray-500    ring-1 ring-gray-400/20',
  void:     'bg-gray-100   text-gray-400    ring-1 ring-gray-300/40',
  morning:  'bg-blue-50    text-blue-700    ring-1 ring-blue-600/20',
  evening:  'bg-purple-50  text-purple-700  ring-1 ring-purple-600/20',
};

const labels: Record<BadgeVariant, string> = {
  paid:     'Paid',
  pending:  'Pending',
  draft:    'Draft',
  flagged:  'Flagged',
  overdue:  'Overdue',
  active:   'Active',
  inactive: 'Inactive',
  void:     'Void',
  morning:  'Morning',
  evening:  'Evening',
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
