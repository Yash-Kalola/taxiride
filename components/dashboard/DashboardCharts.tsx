import { formatCurrency } from '@/lib/tax';
import { MONTHS } from '@/lib/constants';

export interface MonthPoint {
  month: number;      // 1-12
  year:  number;
  revenue: number;    // gross earnings — company cars only
  carExpenses: number;      // gas + call + extra (from daily sheets)
  companyExpenses: number;  // CompanyExpense totals
  companyNet: number;       // gross × 60% − debit − gas − call − extra
}

export interface ExpenseSlice {
  label: string;
  value: number;
  color: string;
}

/** Bar chart: revenue vs total expenses, last N months. */
export function RevenueExpenseChart({ points }: { points: MonthPoint[] }) {
  if (points.length === 0) {
    return (
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900">Revenue vs Expenses</h2>
        <p className="mt-1 text-xs text-gray-500">No data yet for trend chart.</p>
      </div>
    );
  }

  const max = Math.max(
    ...points.map((p) => Math.max(p.revenue, p.carExpenses + p.companyExpenses)),
    1,
  );
  // Nice ceiling: round up to 2 significant figures
  const niceMax = niceCeil(max);

  const width = 640;
  const height = 240;
  const padL = 52, padR = 16, padT = 16, padB = 40;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const groupW = chartW / points.length;
  const barW = Math.min(18, (groupW - 8) / 2);
  const gridLines = 4;

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Revenue vs Expenses</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Last {points.length} month{points.length !== 1 ? 's' : ''} · company cabs only
          </p>
        </div>
        <div className="flex items-center gap-3 text-xs">
          <LegendDot color="#4F46E5" label="Revenue" />
          <LegendDot color="#F59E0B" label="Expenses" />
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid lines + y-axis labels */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const y = padT + (chartH * i) / gridLines;
          const v = niceMax * (1 - i / gridLines);
          return (
            <g key={i}>
              <line x1={padL} y1={y} x2={width - padR} y2={y} stroke="#F3F4F6" strokeWidth={1} />
              <text x={padL - 6} y={y + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">
                {shortCurrency(v)}
              </text>
            </g>
          );
        })}

        {/* Bars */}
        {points.map((p, i) => {
          const groupX = padL + groupW * i;
          const rev = (p.revenue / niceMax) * chartH;
          const exp = ((p.carExpenses + p.companyExpenses) / niceMax) * chartH;
          const barGap = 4;
          const revX = groupX + (groupW - barW * 2 - barGap) / 2;
          const expX = revX + barW + barGap;
          return (
            <g key={i}>
              <rect x={revX} y={padT + chartH - rev} width={barW} height={rev} fill="#4F46E5" rx={2}>
                <title>{`${MONTHS[p.month - 1].slice(0, 3)} ${p.year} — Revenue ${formatCurrency(p.revenue)}`}</title>
              </rect>
              <rect x={expX} y={padT + chartH - exp} width={barW} height={exp} fill="#F59E0B" rx={2}>
                <title>{`${MONTHS[p.month - 1].slice(0, 3)} ${p.year} — Expenses ${formatCurrency(p.carExpenses + p.companyExpenses)}`}</title>
              </rect>
              <text
                x={groupX + groupW / 2}
                y={height - padB + 14}
                textAnchor="middle"
                fontSize={10}
                fill="#6B7280"
              >
                {MONTHS[p.month - 1].slice(0, 3)}
              </text>
              <text
                x={groupX + groupW / 2}
                y={height - padB + 26}
                textAnchor="middle"
                fontSize={8}
                fill="#9CA3AF"
              >
                {String(p.year).slice(-2)}
              </text>
            </g>
          );
        })}

        {/* Axis line */}
        <line x1={padL} y1={padT + chartH} x2={width - padR} y2={padT + chartH} stroke="#E5E7EB" strokeWidth={1} />
      </svg>
    </div>
  );
}

/** Line chart: company net profit, last N months. */
export function NetProfitLineChart({ points }: { points: MonthPoint[] }) {
  if (points.length === 0) return null;

  const width = 640;
  const height = 200;
  const padL = 52, padR = 16, padT = 16, padB = 36;
  const chartW = width - padL - padR;
  const chartH = height - padT - padB;

  const values = points.map((p) => p.companyNet);
  const vMin = Math.min(...values, 0);
  const vMax = Math.max(...values, 0);
  const span = (vMax - vMin) || 1;
  const niceLo = Math.floor(vMin / 1000) * 1000;
  const niceHi = Math.ceil(vMax / 1000) * 1000;
  const niceSpan = (niceHi - niceLo) || span;

  const x = (i: number) =>
    points.length === 1
      ? padL + chartW / 2
      : padL + (chartW * i) / (points.length - 1);
  const y = (v: number) => padT + chartH - ((v - niceLo) / niceSpan) * chartH;

  const zeroY = y(0);
  const gridLines = 4;

  const path = points.map((p, i) => `${i === 0 ? 'M' : 'L'} ${x(i).toFixed(1)} ${y(p.companyNet).toFixed(1)}`).join(' ');

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6">
      <div className="flex items-start justify-between mb-4">
        <div>
          <h2 className="text-sm font-semibold text-gray-900">Company Net Profit</h2>
          <p className="mt-0.5 text-xs text-gray-500">
            Last {points.length} month{points.length !== 1 ? 's' : ''} · after all car expenses
          </p>
        </div>
      </div>

      <svg viewBox={`0 0 ${width} ${height}`} className="w-full h-auto">
        {/* Grid + labels */}
        {Array.from({ length: gridLines + 1 }).map((_, i) => {
          const gy = padT + (chartH * i) / gridLines;
          const v = niceHi - ((niceHi - niceLo) * i) / gridLines;
          return (
            <g key={i}>
              <line x1={padL} y1={gy} x2={width - padR} y2={gy} stroke="#F3F4F6" strokeWidth={1} />
              <text x={padL - 6} y={gy + 3} textAnchor="end" fontSize={9} fill="#9CA3AF">
                {shortCurrency(v)}
              </text>
            </g>
          );
        })}

        {/* Zero line (when it's inside the chart) */}
        {niceLo < 0 && niceHi > 0 && (
          <line x1={padL} y1={zeroY} x2={width - padR} y2={zeroY} stroke="#9CA3AF" strokeDasharray="3 3" strokeWidth={1} />
        )}

        {/* Line */}
        <path d={path} fill="none" stroke="#10B981" strokeWidth={2.5} strokeLinejoin="round" strokeLinecap="round" />

        {/* Points */}
        {points.map((p, i) => (
          <circle key={i} cx={x(i)} cy={y(p.companyNet)} r={3.5} fill="#ffffff" stroke="#10B981" strokeWidth={2}>
            <title>{`${MONTHS[p.month - 1].slice(0, 3)} ${p.year} — ${formatCurrency(p.companyNet)}`}</title>
          </circle>
        ))}

        {/* X labels */}
        {points.map((p, i) => (
          <text
            key={i}
            x={x(i)}
            y={height - padB + 14}
            textAnchor="middle"
            fontSize={10}
            fill="#6B7280"
          >
            {MONTHS[p.month - 1].slice(0, 3)}
          </text>
        ))}
      </svg>
    </div>
  );
}

/** Donut chart: current-month expense breakdown. */
export function ExpenseBreakdownChart({ slices, title, sub }: {
  slices: ExpenseSlice[];
  title: string;
  sub?: string;
}) {
  const total = slices.reduce((s, x) => s + x.value, 0);
  const nonEmpty = slices.filter((s) => s.value > 0);

  if (total <= 0) {
    return (
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6">
        <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
        {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}
        <div className="mt-6 text-center text-xs text-gray-400 italic">No expenses recorded.</div>
      </div>
    );
  }

  const size = 160;
  const cx = size / 2, cy = size / 2;
  const r = 64, rInner = 42;

  let acc = 0;
  const arcs = nonEmpty.map((s) => {
    const frac = s.value / total;
    const start = acc * 2 * Math.PI;
    acc += frac;
    const end = acc * 2 * Math.PI;
    return { ...s, frac, d: donutArc(cx, cy, r, rInner, start, end) };
  });

  return (
    <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 p-6">
      <h2 className="text-sm font-semibold text-gray-900">{title}</h2>
      {sub && <p className="mt-0.5 text-xs text-gray-500">{sub}</p>}

      <div className="mt-4 flex items-center gap-5">
        <svg viewBox={`0 0 ${size} ${size}`} className="h-40 w-40 shrink-0">
          {arcs.length === 1 ? (
            // Single slice — draw two full semicircles to avoid the full-circle arc bug
            <>
              <circle cx={cx} cy={cy} r={r} fill={arcs[0].color} />
              <circle cx={cx} cy={cy} r={rInner} fill="#ffffff" />
            </>
          ) : arcs.map((a, i) => (
            <path key={i} d={a.d} fill={a.color}>
              <title>{`${a.label} — ${formatCurrency(a.value)} (${(a.frac * 100).toFixed(1)}%)`}</title>
            </path>
          ))}
          <text x={cx} y={cy - 2} textAnchor="middle" fontSize={10} fill="#9CA3AF">Total</text>
          <text x={cx} y={cy + 12} textAnchor="middle" fontSize={13} fontWeight={700} fill="#111827">
            {shortCurrency(total)}
          </text>
        </svg>

        <div className="flex-1 space-y-1.5">
          {slices.map((s) => (
            <div key={s.label} className="flex items-center justify-between text-xs">
              <div className="flex items-center gap-2">
                <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: s.color }} />
                <span className="text-gray-600">{s.label}</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="font-semibold text-gray-900">{formatCurrency(s.value)}</span>
                <span className="text-gray-400 tabular-nums w-10 text-right">
                  {total > 0 ? `${((s.value / total) * 100).toFixed(0)}%` : '—'}
                </span>
              </div>
            </div>
          ))}
        </div>
      </div>
    </div>
  );
}

function LegendDot({ color, label }: { color: string; label: string }) {
  return (
    <span className="inline-flex items-center gap-1.5 text-gray-600">
      <span className="h-2.5 w-2.5 rounded-sm" style={{ backgroundColor: color }} />
      {label}
    </span>
  );
}

function niceCeil(v: number): number {
  if (v <= 0) return 1;
  const pow = Math.pow(10, Math.floor(Math.log10(v)));
  const n = v / pow;
  const nice = n <= 1 ? 1 : n <= 2 ? 2 : n <= 2.5 ? 2.5 : n <= 5 ? 5 : 10;
  return nice * pow;
}

function shortCurrency(v: number): string {
  const abs = Math.abs(v);
  if (abs >= 1_000_000) return `$${(v / 1_000_000).toFixed(1)}M`;
  if (abs >= 1_000)     return `$${(v / 1_000).toFixed(abs >= 10_000 ? 0 : 1)}k`;
  return `$${v.toFixed(0)}`;
}

function donutArc(cx: number, cy: number, r: number, rInner: number, start: number, end: number): string {
  const large = end - start > Math.PI ? 1 : 0;
  const x1 = cx + r * Math.sin(start),       y1 = cy - r * Math.cos(start);
  const x2 = cx + r * Math.sin(end),         y2 = cy - r * Math.cos(end);
  const x3 = cx + rInner * Math.sin(end),    y3 = cy - rInner * Math.cos(end);
  const x4 = cx + rInner * Math.sin(start),  y4 = cy - rInner * Math.cos(start);
  return [
    `M ${x1.toFixed(2)} ${y1.toFixed(2)}`,
    `A ${r} ${r} 0 ${large} 1 ${x2.toFixed(2)} ${y2.toFixed(2)}`,
    `L ${x3.toFixed(2)} ${y3.toFixed(2)}`,
    `A ${rInner} ${rInner} 0 ${large} 0 ${x4.toFixed(2)} ${y4.toFixed(2)}`,
    'Z',
  ].join(' ');
}
