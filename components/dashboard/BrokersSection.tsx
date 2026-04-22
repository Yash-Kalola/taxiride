'use client';
import { useEffect, useState } from 'react';
import Link from 'next/link';
import Select from '@/components/ui/Select';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';

interface BrokerStat {
  id: string; name: string;
  total: number; paid: number; pending: number; outflow: number;
}
interface Aggregate {
  total: number; paid: number; pending: number; outflow: number; brokerCount: number;
}

/**
 * Dashboard Brokers section — aggregate card + per-broker grid, filterable
 * by Month + Year. Default is "All Time" (year = "", month = "") per Yash's
 * ask. Month is disabled when Year is blank (whole-timeline filter).
 */
export default function BrokersSection({
  initialAggregate,
  initialBrokers,
  initialYear,
  initialMonth,
  availableYears,
}: {
  initialAggregate: Aggregate;
  initialBrokers:   BrokerStat[];
  initialYear:      number | '';
  initialMonth:     number | '';
  availableYears:   number[];
}) {
  const [year,      setYear]      = useState<number | ''>(initialYear);
  const [month,     setMonth]     = useState<number | ''>(initialMonth);
  const [aggregate, setAggregate] = useState<Aggregate>(initialAggregate);
  const [brokers,   setBrokers]   = useState<BrokerStat[]>(initialBrokers);
  const [loading,   setLoading]   = useState(false);

  // Month filter only makes sense if a Year is selected.
  const effectiveMonth = year === '' ? '' : month;

  async function refresh() {
    setLoading(true);
    try {
      const params = new URLSearchParams();
      if (year !== '')           params.set('year',  String(year));
      if (effectiveMonth !== '') params.set('month', String(effectiveMonth));
      const res = await fetch('/api/dashboard/brokers?' + params.toString());
      if (res.ok) {
        const data = await res.json();
        setAggregate(data.aggregate ?? { total: 0, paid: 0, pending: 0, outflow: 0, brokerCount: 0 });
        setBrokers(data.brokers ?? []);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => { refresh(); /* eslint-disable-next-line react-hooks/exhaustive-deps */ }, [year, month]);

  const label =
    year === ''   ? 'All Time'
    : month === '' ? `${year}`
                   : `${MONTHS[(month as number) - 1]} ${year}`;

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Brokers — {label}</h2>
          {loading && <p className="text-xs text-gray-400 mt-0.5">Loading…</p>}
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={year === '' ? '' : String(year)}
            onChange={(e) => setYear(e.target.value === '' ? '' : parseInt(e.target.value))}
          >
            <option value="">All Time</option>
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select
            value={month === '' ? '' : String(month)}
            onChange={(e) => setMonth(e.target.value === '' ? '' : parseInt(e.target.value))}
            disabled={year === ''}
          >
            <option value="">All Months</option>
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
          <Link href="/brokers" className="text-sm font-medium text-indigo-600 hover:text-indigo-700 whitespace-nowrap">All brokers →</Link>
        </div>
      </div>

      {/* Aggregate "All Brokers" card — full-width, indigo-tinted to stand out */}
      <div className="rounded-2xl p-5 shadow-sm ring-1 ring-indigo-200 bg-indigo-50/40 mb-4">
        <p className="text-xs font-semibold uppercase tracking-widest text-indigo-500">
          All Brokers {aggregate.brokerCount > 0 && <span className="text-gray-400">· {aggregate.brokerCount}</span>}
        </p>
        <p className={`mt-2 text-3xl font-bold ${aggregate.total >= 0 ? 'text-emerald-700' : 'text-red-700'}`}>
          {formatCurrency(aggregate.total)}
        </p>
        <div className="mt-3 grid grid-cols-2 max-w-sm gap-2 border-t border-indigo-100 pt-3">
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Paid</p>
            <p className="mt-0.5 text-sm font-semibold text-emerald-600">{formatCurrency(aggregate.paid)}</p>
          </div>
          <div>
            <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">Pending</p>
            <p className="mt-0.5 text-sm font-semibold text-amber-600">{formatCurrency(aggregate.pending)}</p>
          </div>
        </div>
        {aggregate.outflow > 0 && (
          <p className="mt-2 text-xs text-gray-500">− {formatCurrency(aggregate.outflow)} paid out to brokers</p>
        )}
      </div>

      {brokers.length === 0 ? (
        <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 px-6 py-10 text-center text-sm text-gray-400">
          No broker billing in this window.
        </div>
      ) : (
        <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 xl:grid-cols-4 gap-4">
          {brokers.map((b) => <BrokerCard key={b.id} stat={b} />)}
        </div>
      )}
    </section>
  );
}

function BrokerCard({ stat }: { stat: BrokerStat }) {
  const tone = stat.total >= 0 ? 'text-emerald-600' : 'text-red-600';
  return (
    <Link
      href={`/brokers/${stat.id}`}
      className="group rounded-2xl p-5 shadow-sm ring-1 ring-gray-200 bg-white hover:ring-indigo-200 hover:shadow-md transition-shadow"
    >
      <p className="text-sm font-semibold text-gray-900 truncate group-hover:text-indigo-700" title={stat.name}>{stat.name}</p>
      <p className={`mt-2 text-2xl font-bold ${tone}`}>{formatCurrency(stat.total)}</p>
      <div className="mt-3 grid grid-cols-2 gap-2 border-t border-gray-100 pt-3">
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-emerald-500">Paid</p>
          <p className="mt-0.5 text-sm font-semibold text-emerald-600">{formatCurrency(stat.paid)}</p>
        </div>
        <div>
          <p className="text-[10px] font-semibold uppercase tracking-wide text-amber-500">Pending</p>
          <p className="mt-0.5 text-sm font-semibold text-amber-600">{formatCurrency(stat.pending)}</p>
        </div>
      </div>
      {stat.outflow > 0 && (
        <p className="mt-2 text-xs text-gray-400">− {formatCurrency(stat.outflow)} paid out</p>
      )}
    </Link>
  );
}
