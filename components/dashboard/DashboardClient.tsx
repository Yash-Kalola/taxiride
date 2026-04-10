'use client';
import { useCallback, useEffect, useRef, useState } from 'react';
import SummaryCards from './SummaryCards';
import FilterBar from './FilterBar';
import InvoiceTable from './InvoiceTable';
import GenerateModal from './GenerateModal';
import Spinner from '@/components/ui/Spinner';
import type { Company, Invoice } from '@/lib/types';

interface DashboardClientProps {
  companies: Company[];
}

export default function DashboardClient({ companies }: DashboardClientProps) {
  const now = new Date();
  const [year, setYear] = useState(now.getFullYear());
  const [month, setMonth] = useState('');
  const [companySearch, setCompanySearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('All');
  const [invoices, setInvoices] = useState<Invoice[]>([]);
  const [loading, setLoading] = useState(true);
  const [showModal, setShowModal] = useState(false);
  const debounceRef = useRef<ReturnType<typeof setTimeout> | null>(null);

  const fetchInvoices = useCallback(async (params: { year: number; month: string; status: string; company: string }) => {
    setLoading(true);
    try {
      const sp = new URLSearchParams();
      sp.set('year', String(params.year));
      if (params.month) sp.set('month', params.month);
      if (params.status !== 'All') sp.set('status', params.status);
      const res = await fetch(`/api/invoices?${sp.toString()}`);
      if (!res.ok) throw new Error('Failed to fetch');
      let data: Invoice[] = await res.json();
      if (params.company) {
        const q = params.company.toLowerCase();
        data = data.filter((inv) => inv.companyName.toLowerCase().includes(q));
      }
      setInvoices(data);
    } catch {
      setInvoices([]);
    } finally {
      setLoading(false);
    }
  }, []);

  // Fetch on filter changes (debounce company search)
  useEffect(() => {
    if (debounceRef.current) clearTimeout(debounceRef.current);
    debounceRef.current = setTimeout(() => {
      fetchInvoices({ year, month, status: statusFilter, company: companySearch });
    }, 300);
    return () => { if (debounceRef.current) clearTimeout(debounceRef.current); };
  }, [year, month, statusFilter, companySearch, fetchInvoices]);

  // Optimistic PATCH helper
  async function patchInvoice(inv: Invoice, patch: Partial<Pick<Invoice, 'status' | 'flagged' | 'verified'>>) {
    const optimistic = { ...inv, ...patch };
    setInvoices((prev) => prev.map((i) => i.invoiceNumber === inv.invoiceNumber ? optimistic : i));
    try {
      await fetch(`/api/invoices/${inv.invoiceNumber}`, {
        method: 'PATCH',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(patch),
      });
    } catch {
      // Revert on failure
      setInvoices((prev) => prev.map((i) => i.invoiceNumber === inv.invoiceNumber ? inv : i));
    }
  }

  return (
    <div className="mx-auto max-w-7xl px-4 py-8 space-y-6">
      <SummaryCards invoices={invoices} />

      <FilterBar
        year={year}
        month={month}
        companySearch={companySearch}
        statusFilter={statusFilter}
        onYearChange={setYear}
        onMonthChange={setMonth}
        onCompanySearch={setCompanySearch}
        onStatusChange={setStatusFilter}
        onGenerate={() => setShowModal(true)}
      />

      {loading ? (
        <div className="flex justify-center py-16"><Spinner size="lg" /></div>
      ) : (
        <InvoiceTable
          invoices={invoices}
          onMarkPaid={(inv) => patchInvoice(inv, { status: 'Paid' })}
          onMarkUnpaid={(inv) => patchInvoice(inv, { status: 'Pending' })}
          onUnflag={(inv) => patchInvoice(inv, { flagged: false, verified: true })}
          onFlag={(inv) => patchInvoice(inv, { flagged: true })}
          onResend={(inv) => {
            if (confirm(`Resend Invoice #${inv.invoiceNumber} to ${inv.companyName}?`)) {
              fetch('/api/invoices/generate', {
                method: 'POST',
                headers: { 'Content-Type': 'application/json' },
                body: JSON.stringify({ accountId: inv.accountId, month: inv.month, year: inv.year }),
              });
            }
          }}
        />
      )}

      {showModal && (
        <GenerateModal
          companies={companies}
          onClose={() => setShowModal(false)}
          onSuccess={() => fetchInvoices({ year, month, status: statusFilter, company: companySearch })}
        />
      )}
    </div>
  );
}
