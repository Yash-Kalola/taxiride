'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { MONTHS, YEARS } from '@/lib/constants';
import { formatCurrency } from '@/lib/tax';

interface InvoiceRow {
  id: string;
  invoiceNumber: number;
  month: string;
  year: number;
  total: number;
  flagged: boolean;
  verified: boolean;
  status: string;
  company: { id: string; companyName: string };
}

export default function MonthlyOverview({
  invoices,
  companies: allCompanies,
}: {
  invoices: InvoiceRow[];
  companies: { id: string; companyName: string }[];
}) {
  // Default to the most recent year that has data, falling back to current year
  const availableYears = useMemo(() => {
    const ys = [...new Set(invoices.map((i) => i.year))].sort((a, b) => b - a);
    return ys.length > 0 ? ys : [new Date().getFullYear()];
  }, [invoices]);

  const [year, setYear] = useState<number>(availableYears[0]);

  // Filter to selected year
  const yearInvoices = useMemo(
    () => invoices.filter((i) => i.year === year),
    [invoices, year]
  );

  // Months that have at least one invoice in this year (in calendar order)
  const activeMonths = useMemo(() => {
    const ms = new Set(yearInvoices.map((i) => i.month));
    return MONTHS.filter((m) => ms.has(m));
  }, [yearInvoices]);

  // ALL companies (not just those with invoices) — shows inactive companies too
  const companies = allCompanies;

  // Build lookup: companyId + month → invoice
  const lookup = useMemo(() => {
    const m = new Map<string, InvoiceRow>();
    yearInvoices.forEach((i) => m.set(`${i.company.id}::${i.month}`, i));
    return m;
  }, [yearInvoices]);

  // Column totals (sum per month)
  const monthTotals = useMemo(
    () => Object.fromEntries(
      activeMonths.map((m) => [
        m,
        yearInvoices.filter((i) => i.month === m).reduce((s, i) => s + i.total, 0),
      ])
    ),
    [yearInvoices, activeMonths]
  );

  const grandTotal = yearInvoices.reduce((s, i) => s + i.total, 0);
  const flaggedCount = yearInvoices.filter((i) => i.flagged && !i.verified).length;

  if (companies.length === 0) {
    return (
      <div className="space-y-6">
        <PageHeader title="Monthly Overview" description="No companies yet — add companies to see them here." />
      </div>
    );
  }

  return (
    <div className="space-y-6">
      <PageHeader
        title="Monthly Overview"
        description={`${year} · ${companies.length} companies · ${yearInvoices.length} invoices · ${formatCurrency(grandTotal)} invoiced`}
        action={
          flaggedCount > 0 ? (
            <span className="inline-flex items-center gap-1.5 rounded-full bg-red-50 px-3 py-1 text-xs font-semibold text-red-600 ring-1 ring-red-200">
              <span className="h-1.5 w-1.5 rounded-full bg-red-500 animate-pulse" />
              {flaggedCount} flagged
            </span>
          ) : undefined
        }
      />

      {/* Year selector */}
      <div className="flex items-center gap-3">
        <Select
          value={year}
          onChange={(e) => setYear(parseInt(e.target.value))}
          className="w-28"
        >
          {availableYears.map((y) => (
            <option key={y} value={y}>{y}</option>
          ))}
        </Select>
        <p className="text-sm text-gray-400">
          {activeMonths.length} month{activeMonths.length !== 1 ? 's' : ''} with invoices
        </p>
      </div>

      {activeMonths.length === 0 ? (
        <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
          <p className="text-sm font-medium text-gray-500">No invoices for {year}</p>
        </div>
      ) : (
        <div className="overflow-x-auto rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <table className="w-full">
            <thead>
              <tr className="border-b border-gray-100 bg-gray-50">
                {/* Company column */}
                <th className="sticky left-0 z-10 bg-gray-50 px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[180px]">
                  Company
                </th>
                {/* Month columns */}
                {activeMonths.map((m) => (
                  <th key={m} className="px-4 py-3.5 text-center text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[110px]">
                    {m.slice(0, 3)}
                  </th>
                ))}
                {/* Row total */}
                <th className="px-5 py-3.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-400 min-w-[110px]">
                  Total
                </th>
              </tr>
            </thead>

            <tbody className="divide-y divide-gray-50">
              {companies.map((co) => {
                const rowTotal = activeMonths.reduce((s, m) => {
                  const inv = lookup.get(`${co.id}::${m}`);
                  return s + (inv?.total ?? 0);
                }, 0);

                return (
                  <tr key={co.id} className="hover:bg-gray-50/60 transition-colors group">
                    {/* Company name */}
                    <td className="sticky left-0 z-10 bg-white px-5 py-3.5 group-hover:bg-gray-50/60 transition-colors">
                      <span className="text-sm font-semibold text-gray-900 truncate max-w-[160px] block">
                        {co.companyName}
                      </span>
                    </td>

                    {/* Month cells */}
                    {activeMonths.map((m) => {
                      const inv = lookup.get(`${co.id}::${m}`);
                      if (!inv) {
                        return (
                          <td key={m} className="px-4 py-3.5 text-center">
                            <span className="text-xs text-gray-300">—</span>
                          </td>
                        );
                      }

                      const isFlagged = inv.flagged && !inv.verified;
                      const isPaid    = inv.status === 'PAID';

                      return (
                        <td
                          key={m}
                          className={`px-4 py-3.5 text-center transition-colors ${
                            isFlagged ? 'bg-red-50' : ''
                          }`}
                        >
                          <Link href={`/invoices/${inv.id}`} className="group/cell block">
                            <span className={`block text-sm font-semibold tabular-nums ${
                              isFlagged ? 'text-red-700' : isPaid ? 'text-emerald-700' : 'text-gray-900'
                            } group-hover/cell:underline`}>
                              {formatCurrency(inv.total)}
                            </span>
                            {isFlagged && (
                              <span className="mt-0.5 block text-[10px] font-medium text-red-500">
                                ▼ dropped
                              </span>
                            )}
                            {isPaid && !isFlagged && (
                              <span className="mt-0.5 block text-[10px] font-medium text-emerald-500">
                                paid
                              </span>
                            )}
                            {inv.status === 'PENDING' && !isFlagged && (
                              <span className="mt-0.5 block text-[10px] text-amber-500">
                                pending
                              </span>
                            )}
                            {inv.status === 'DRAFT' && !isFlagged && (
                              <span className="mt-0.5 block text-[10px] text-gray-400">
                                draft
                              </span>
                            )}
                          </Link>
                        </td>
                      );
                    })}

                    {/* Row total */}
                    <td className="px-5 py-3.5 text-right">
                      <span className="text-sm font-bold text-gray-700 tabular-nums">
                        {formatCurrency(rowTotal)}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>

            {/* Column totals footer */}
            <tfoot>
              <tr className="border-t-2 border-gray-200 bg-gray-50">
                <td className="sticky left-0 z-10 bg-gray-50 px-5 py-3.5">
                  <span className="text-xs font-bold uppercase tracking-wide text-gray-500">Monthly Total</span>
                </td>
                {activeMonths.map((m) => (
                  <td key={m} className="px-4 py-3.5 text-center">
                    <span className="text-sm font-bold text-gray-900 tabular-nums">
                      {formatCurrency(monthTotals[m] ?? 0)}
                    </span>
                  </td>
                ))}
                <td className="px-5 py-3.5 text-right">
                  <span className="text-sm font-bold text-indigo-700 tabular-nums">
                    {formatCurrency(grandTotal)}
                  </span>
                </td>
              </tr>
            </tfoot>
          </table>
        </div>
      )}

      {/* Legend */}
      <div className="flex flex-wrap gap-4 text-xs text-gray-500">
        <span className="flex items-center gap-1.5">
          <span className="h-3 w-5 rounded bg-red-100 inline-block" />
          Flagged (dropped from previous month)
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-emerald-600 font-semibold">$000</span>
          Paid
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-amber-500 font-semibold">$000</span>
          Pending
        </span>
        <span className="flex items-center gap-1.5">
          <span className="text-gray-400">—</span>
          No invoice this month
        </span>
      </div>
    </div>
  );
}
