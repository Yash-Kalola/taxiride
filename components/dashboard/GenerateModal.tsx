'use client';
import { useState } from 'react';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Spinner from '@/components/ui/Spinner';
import type { Company } from '@/lib/types';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEARS = [2024, 2025, 2026, 2027];

interface GenerateModalProps {
  companies: Company[];
  onClose: () => void;
  onSuccess: () => void;
}

export default function GenerateModal({ companies, onClose, onSuccess }: GenerateModalProps) {
  const now = new Date();
  const [accountId, setAccountId] = useState(companies[0]?.accountId ?? '');
  const [month, setMonth] = useState(MONTHS[now.getMonth()]);
  const [year, setYear] = useState(now.getFullYear());
  const [loading, setLoading] = useState(false);
  const [result, setResult] = useState<{ invoiceNumber?: number; flagged?: boolean; error?: string } | null>(null);

  async function handleGenerate() {
    setLoading(true);
    setResult(null);
    try {
      const res = await fetch('/api/invoices/generate', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ accountId, month, year }),
      });
      const data = await res.json();
      if (!res.ok) {
        setResult({ error: data.error ?? 'Failed to generate invoice' });
      } else {
        setResult({ invoiceNumber: data.invoiceNumber, flagged: data.flagged });
      }
    } catch {
      setResult({ error: 'Network error — please try again' });
    } finally {
      setLoading(false);
    }
  }

  function handleClose() {
    if (result?.invoiceNumber) onSuccess();
    onClose();
  }

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/40">
      <div className="w-full max-w-md rounded-xl bg-white p-6 shadow-xl">
        <h2 className="mb-4 text-lg font-semibold text-gray-900">Generate Invoice</h2>

        <div className="space-y-4">
          <Select label="Company" value={accountId} onChange={(e) => setAccountId(e.target.value)}>
            {companies.map((c) => (
              <option key={c.accountId} value={c.accountId}>{c.companyName}</option>
            ))}
          </Select>

          <div className="grid grid-cols-2 gap-3">
            <Select label="Month" value={month} onChange={(e) => setMonth(e.target.value)}>
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select label="Year" value={year} onChange={(e) => setYear(parseInt(e.target.value))}>
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>
        </div>

        {result && (
          <div className={`mt-4 rounded-md p-3 text-sm ${result.error ? 'bg-red-50 text-red-700' : 'bg-green-50 text-green-700'}`}>
            {result.error
              ? result.error
              : `Invoice #${result.invoiceNumber} generated successfully.${result.flagged ? ' ⚠ Flagged: fewer rides than expected.' : ''}`
            }
          </div>
        )}

        <div className="mt-6 flex justify-end gap-2">
          <Button variant="ghost" onClick={handleClose}>
            {result?.invoiceNumber ? 'Close' : 'Cancel'}
          </Button>
          {!result?.invoiceNumber && (
            <Button variant="primary" onClick={handleGenerate} disabled={loading || !accountId}>
              {loading ? <><Spinner size="sm" /> Generating…</> : 'Generate & Send'}
            </Button>
          )}
        </div>
      </div>
    </div>
  );
}
