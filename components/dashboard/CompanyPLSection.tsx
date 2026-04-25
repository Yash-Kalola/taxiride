'use client';
import { useEffect, useState } from 'react';
import Select from '@/components/ui/Select';
import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';

interface PL {
  vehicleProfit: number;
  brokerProfit:  number;
  otherExpense:  number;
  totalProfit:   number;
  brokerCount:   number;
  vehicleCount:  number;
}

/**
 * Top Company P&L block — 4 Big Stats with a Month/Year filter, mirroring
 * the Brokers section filter pattern. Defaults to current month.
 */
export default function CompanyPLSection({
  initialPL,
  initialMonth,
  initialYear,
  availableYears,
}: {
  initialPL:      PL;
  initialMonth:   number;
  initialYear:    number;
  availableYears: number[];
}) {
  const [pl,      setPL]      = useState<PL>(initialPL);
  const [month,   setMonth]   = useState<number>(initialMonth);
  const [year,    setYear]    = useState<number>(initialYear);
  const [loading, setLoading] = useState(false);
  const [isInitial, setIsInitial] = useState(true);

  async function refresh(m: number, y: number) {
    setLoading(true);
    try {
      const res = await fetch(`/api/dashboard/period-stats?month=${m}&year=${y}`);
      if (res.ok) {
        const data = await res.json();
        if (data.pl) setPL(data.pl);
      }
    } finally { setLoading(false); }
  }

  useEffect(() => {
    if (isInitial) { setIsInitial(false); return; }
    refresh(month, year);
    /* eslint-disable-next-line react-hooks/exhaustive-deps */
  }, [month, year]);

  const label = `${MONTHS[month - 1]} ${year}`;

  return (
    <section>
      <div className="flex items-center justify-between mb-3 flex-wrap gap-3">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Company P&amp;L — {label}</h2>
          <p className="text-xs text-gray-400">
            Rough first draft · numbers still being refined
            {loading && <span className="ml-2 text-indigo-500">Loading…</span>}
          </p>
        </div>
        <div className="flex items-center gap-2">
          <Select
            value={String(year)}
            onChange={(e) => setYear(parseInt(e.target.value))}
          >
            {availableYears.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <Select
            value={String(month)}
            onChange={(e) => setMonth(parseInt(e.target.value))}
          >
            {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
          </Select>
        </div>
      </div>

      <div className="grid grid-cols-1 md:grid-cols-4 gap-4">
        <BigStat
          label="Vehicle Profit"
          value={pl.vehicleProfit}
          sub={`${pl.vehicleCount} company cab${pl.vehicleCount !== 1 ? 's' : ''}`}
          tone={pl.vehicleProfit >= 0 ? 'positive' : 'negative'}
        />
        <BigStat
          label="Broker Profit"
          value={pl.brokerProfit}
          sub={`${MONTHS[month - 1]} only · ${pl.brokerCount} broker${pl.brokerCount !== 1 ? 's' : ''}`}
          tone={pl.brokerProfit >= 0 ? 'positive' : 'negative'}
        />
        <BigStat
          label="Other Expense"
          value={-pl.otherExpense}
          sub="from Company Expenses"
          tone={pl.otherExpense > 0 ? 'muted-negative' : 'muted'}
        />
        <BigStat
          label="Total Profit"
          value={pl.totalProfit}
          sub="Vehicle + Broker − Other"
          tone={pl.totalProfit >= 0 ? 'positive-strong' : 'negative-strong'}
        />
      </div>
    </section>
  );
}

type Tone = 'positive' | 'positive-strong' | 'negative' | 'negative-strong' | 'muted' | 'muted-negative';

function BigStat({ label, value, sub, tone }: {
  label: string; value: number; sub?: string; tone: Tone;
}) {
  const color =
    tone === 'positive-strong' ? 'text-emerald-700' :
    tone === 'negative-strong' ? 'text-red-700'     :
    tone === 'positive'        ? 'text-emerald-600' :
    tone === 'negative'        ? 'text-red-600'     :
    tone === 'muted-negative'  ? 'text-amber-600'   :
                                 'text-gray-500';
  const ring =
    tone === 'positive-strong' ? 'ring-emerald-200 bg-emerald-50' :
    tone === 'negative-strong' ? 'ring-red-200 bg-red-50'         :
                                 'ring-gray-200 bg-white';
  return (
    <div className={`rounded-2xl p-5 shadow-sm ring-1 ${ring}`}>
      <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{label}</p>
      <p className={`mt-2 text-3xl font-bold ${color}`}>{formatCurrency(value)}</p>
      {sub && <p className="mt-1 text-xs text-gray-500">{sub}</p>}
    </div>
  );
}
