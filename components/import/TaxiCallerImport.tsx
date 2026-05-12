'use client';
import { useState, useRef, useMemo, useCallback } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Select from '@/components/ui/Select';
import Badge from '@/components/ui/Badge';
import Spinner from '@/components/ui/Spinner';
import PageHeader from '@/components/ui/PageHeader';
import { MONTHS, YEARS } from '@/lib/constants';
import { formatCurrency } from '@/lib/tax';

// ─── Types ────────────────────────────────────────────────────────────────────

interface Company {
  id: string;
  accountId: string;
  companyName: string;
}

interface ParsedRideRow {
  rowIndex: number;
  jobId: string;
  dateTime: string;
  passenger: string;
  customerPhone: string;
  pickupLocation: string;
  dropoffLocation: string;
  vehicleNumber: string;
  driver: string;
  amount: number;
}

// TaxiCaller's phone column label has varied over time; try the common ones.
const PHONE_COLUMN_CANDIDATES = [
  'Phone',
  'Phone Number',
  'Passenger Phone',
  'Passenger Phone Number',
  'Contact',
  'Customer Phone',
  'Mobile',
];
function readPhone(row: Record<string, unknown>): string {
  for (const key of PHONE_COLUMN_CANDIDATES) {
    const v = row[key];
    if (v != null && String(v).trim() !== '') return String(v).trim();
  }
  return '';
}

interface CompanyGroup {
  accountId: string;
  companyId: string;
  companyName: string;
  rows: ParsedRideRow[];
  selected: boolean;
  sendMode: 'send' | 'draft';   // 'send' = email goes out; 'draft' = created without email
}

interface UnmatchedAccount {
  accountId: string;
  rowCount: number;
}

interface ImportResult {
  companyId: string;
  companyName: string;
  status: 'success' | 'error';
  invoiceId?: string;
  invoiceNumber?: number;
  amountTotal?: number;
  flagged?: boolean;
  duplicatesSkipped?: number;
  sentAs?: 'sent' | 'draft';  // distinguishes emailed vs. kept as draft
  error?: string;
  emailError?: string;        // SMTP failure message when send failed but invoice was still created
}

type WizardStep = 'upload' | 'preview' | 'results';

interface WizardState {
  step: WizardStep;
  fileError: string | null;
  groups: CompanyGroup[];
  unmatched: UnmatchedAccount[];
  month: string;
  year: number;
  submitting: boolean;
  results: ImportResult[];
}

// ─── Date helpers ─────────────────────────────────────────────────────────────

function parseExcelDate(value: string | number, XLSX: typeof import('xlsx')): string {
  if (typeof value === 'number') {
    try {
      return XLSX.SSF.format('yyyy-mm-dd', value);
    } catch {
      return '';
    }
  }
  const str = String(value).trim();
  if (!str) return '';
  // Try common formats: "01/15/2025", "1/15/2025", "2025-01-15"
  const iso = str.match(/^(\d{4})-(\d{2})-(\d{2})/);
  if (iso) return `${iso[1]}-${iso[2]}-${iso[3]}`;
  const mdy = str.match(/^(\d{1,2})\/(\d{1,2})\/(\d{4})/);
  if (mdy) return `${mdy[3]}-${mdy[1].padStart(2, '0')}-${mdy[2].padStart(2, '0')}`;
  return str;
}

function buildDateTime(dateStr: string, startStr: string): string {
  if (!dateStr) return '';
  const time = String(startStr ?? '').trim();
  return time ? `${dateStr} ${time}` : dateStr;
}

// ─── Component ────────────────────────────────────────────────────────────────

const now = new Date();
const INITIAL: WizardState = {
  step: 'upload',
  fileError: null,
  groups: [],
  unmatched: [],
  month: MONTHS[now.getMonth()],
  year: now.getFullYear(),
  submitting: false,
  results: [],
};

export default function TaxiCallerImport({ companies }: { companies: Company[] }) {
  const [wizard, setWizard] = useState<WizardState>(INITIAL);
  const [collapsed, setCollapsed] = useState<Set<string>>(new Set());
  const [fileName, setFileName] = useState('');
  const [isDragging, setIsDragging] = useState(false);
  const fileRef = useRef<HTMLInputElement>(null);

  // Map accountId → {id, companyName} for O(1) lookup
  const companyMap = useMemo(
    () => new Map(companies.map((c) => [c.accountId.trim(), { id: c.id, companyName: c.companyName }])),
    [companies]
  );

  // ── File parsing ────────────────────────────────────────────────────────────

  const parseFile = useCallback(
    async (file: File) => {
      if (!file.name.endsWith('.xlsx') && !file.name.endsWith('.xls')) {
        setWizard((w) => ({ ...w, fileError: 'Please upload a .xlsx file exported from TaxiCaller.' }));
        return;
      }
      setFileName(file.name);
      setWizard((w) => ({ ...w, fileError: null }));

      try {
        const XLSX = await import('xlsx');
        const buffer = await file.arrayBuffer();
        const wb = XLSX.read(buffer, { cellDates: false });
        const ws = wb.Sheets[wb.SheetNames[0]];
        // eslint-disable-next-line @typescript-eslint/no-explicit-any
        const rawRows: any[] = XLSX.utils.sheet_to_json(ws, { defval: '' });

        // Filter: only rows where Account ID is non-empty (corporate rides)
        const corporate = rawRows.filter((r) => String(r['Account ID'] ?? '').trim() !== '');

        if (corporate.length === 0) {
          setWizard((w) => ({ ...w, fileError: 'No corporate rides found — the Account ID column is empty for all rows.' }));
          return;
        }

        // Parse each row
        const parsed: ParsedRideRow[] = corporate.map((r, i) => ({
          rowIndex: i,
          jobId:           String(r['Job ID'] ?? '').trim(),
          dateTime:        buildDateTime(parseExcelDate(r['Date'], XLSX), String(r['Start'] ?? '').trim()),
          passenger:       String(r['Passenger'] ?? '').trim(),
          customerPhone:   readPhone(r as Record<string, unknown>),
          pickupLocation:  String(r['Pick-up'] ?? '').trim(),
          dropoffLocation: String(r['Drop-off'] ?? '').trim(),
          vehicleNumber:   String(r['Vehicle #'] ?? '').trim(),
          driver:          String(r['Driver'] ?? '').trim(),
          amount:          parseFloat(String(r['Payable'] ?? '0')) || 0,
        }));

        // Group by accountId
        const groupMap = new Map<string, ParsedRideRow[]>();
        corporate.forEach((r, i) => {
          const acct = String(r['Account ID']).trim();
          if (!groupMap.has(acct)) groupMap.set(acct, []);
          groupMap.get(acct)!.push(parsed[i]);
        });

        // Auto-suggest month/year from dates
        let suggestedMonth = MONTHS[now.getMonth()];
        let suggestedYear  = now.getFullYear();
        const dateMonths = new Set<string>();
        parsed.forEach((r) => {
          const m = r.dateTime.slice(0, 7); // "YYYY-MM"
          if (m.match(/^\d{4}-\d{2}$/)) dateMonths.add(m);
        });
        if (dateMonths.size === 1) {
          const [y, m] = [...dateMonths][0].split('-');
          suggestedYear  = parseInt(y);
          suggestedMonth = MONTHS[parseInt(m) - 1] ?? suggestedMonth;
        }

        // Match to companies
        const groups: CompanyGroup[] = [];
        const unmatched: UnmatchedAccount[] = [];
        groupMap.forEach((rows, accountId) => {
          const match = companyMap.get(accountId);
          if (match) {
            groups.push({ accountId, companyId: match.id, companyName: match.companyName, rows, selected: true, sendMode: 'send' });
          } else {
            unmatched.push({ accountId, rowCount: rows.length });
          }
        });

        // Sort groups alphabetically
        groups.sort((a, b) => a.companyName.localeCompare(b.companyName));

        setWizard((w) => ({
          ...w,
          step: 'preview',
          fileError: null,
          groups,
          unmatched,
          month: suggestedMonth,
          year: suggestedYear,
        }));
        setCollapsed(new Set()); // expand all by default

      } catch (err) {
        setWizard((w) => ({ ...w, fileError: `Failed to parse file: ${String(err)}` }));
      }
    },
    [companyMap]
  );

  // ── Row editing ─────────────────────────────────────────────────────────────
  // The TaxiCaller export isn't always perfect — addresses mis-formatted, wrong
  // cab #, etc. Let the office fix each field before we create the invoice.

  function updateAmount(accountId: string, rowIndex: number, value: string) {
    setWizard((w) => ({
      ...w,
      groups: w.groups.map((g) =>
        g.accountId !== accountId ? g : {
          ...g,
          rows: g.rows.map((r) =>
            r.rowIndex !== rowIndex ? r : { ...r, amount: parseFloat(value) || 0 }
          ),
        }
      ),
    }));
  }

  type EditableRideField =
    | 'passenger' | 'customerPhone'
    | 'pickupLocation' | 'dropoffLocation'
    | 'vehicleNumber' | 'driver' | 'dateTime';

  function updateRowField(accountId: string, rowIndex: number, field: EditableRideField, value: string) {
    setWizard((w) => ({
      ...w,
      groups: w.groups.map((g) =>
        g.accountId !== accountId ? g : {
          ...g,
          rows: g.rows.map((r) =>
            r.rowIndex !== rowIndex ? r : { ...r, [field]: value }
          ),
        }
      ),
    }));
  }

  // Yash: "I need add and delete option here individually ride because if I
  // can not able to resend email then this will help". Lets the office prune
  // a noisy import (e.g. cancelled rides) or sneak in a missed ride before
  // generating the invoices — without bouncing through the rides page.

  function deleteRow(accountId: string, rowIndex: number) {
    setWizard((w) => ({
      ...w,
      groups: w.groups.map((g) =>
        g.accountId !== accountId ? g : { ...g, rows: g.rows.filter((r) => r.rowIndex !== rowIndex) }
      ),
    }));
  }

  function addRow(accountId: string) {
    setWizard((w) => ({
      ...w,
      groups: w.groups.map((g) => {
        if (g.accountId !== accountId) return g;
        // Negative rowIndex sentinel keeps these distinguishable from
        // imported rows; the import API doesn't care about rowIndex.
        const minIdx = g.rows.reduce((m, r) => Math.min(m, r.rowIndex), 0);
        const newRow: ParsedRideRow = {
          rowIndex:        minIdx - 1,
          jobId:           '',
          dateTime:        '',
          passenger:       '',
          customerPhone:   '',
          pickupLocation:  '',
          dropoffLocation: '',
          vehicleNumber:   '',
          driver:          '',
          amount:          0,
        };
        return { ...g, rows: [...g.rows, newRow] };
      }),
    }));
  }

  // ── Group controls ──────────────────────────────────────────────────────────

  function toggleSelected(accountId: string) {
    setWizard((w) => ({
      ...w,
      groups: w.groups.map((g) => g.accountId === accountId ? { ...g, selected: !g.selected } : g),
    }));
  }

  function setSendMode(accountId: string, sendMode: 'send' | 'draft') {
    setWizard((w) => ({
      ...w,
      groups: w.groups.map((g) => g.accountId === accountId ? { ...g, sendMode } : g),
    }));
  }

  function toggleCollapse(accountId: string) {
    setCollapsed((prev) => {
      const next = new Set(prev);
      next.has(accountId) ? next.delete(accountId) : next.add(accountId);
      return next;
    });
  }

  function selectAll(selected: boolean) {
    setWizard((w) => ({ ...w, groups: w.groups.map((g) => ({ ...g, selected })) }));
  }

  // ── Submit ──────────────────────────────────────────────────────────────────

  async function handleSubmit() {
    const selected = wizard.groups.filter((g) => g.selected);
    if (selected.length === 0) return;
    setWizard((w) => ({ ...w, submitting: true }));

    try {
      const res = await fetch('/api/import/taxicaller', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          month: wizard.month,
          year:  wizard.year,
          groups: selected.map((g) => ({
            companyId: g.companyId,
            sendMode:  g.sendMode,
            rows: g.rows.map((r) => ({
              jobId:           r.jobId,
              dateTime:        r.dateTime,
              passenger:       r.passenger,
              customerPhone:   r.customerPhone,
              pickupLocation:  r.pickupLocation,
              dropoffLocation: r.dropoffLocation,
              vehicleNumber:   r.vehicleNumber,
              driver:          r.driver,
              amount:          r.amount,
            })),
          })),
        }),
      });

      const data = await res.json();
      setWizard((w) => ({ ...w, submitting: false, step: 'results', results: data.results ?? [] }));
    } catch (err) {
      setWizard((w) => ({ ...w, submitting: false, fileError: `Network error: ${String(err)}` }));
    }
  }

  // ── Render helpers ──────────────────────────────────────────────────────────

  const selectedCount = wizard.groups.filter((g) => g.selected).length;
  const selectedRides = wizard.groups.filter((g) => g.selected).reduce((s, g) => s + g.rows.length, 0);
  const grandTotal    = wizard.groups.filter((g) => g.selected).reduce(
    (s, g) => s + g.rows.reduce((gs, r) => gs + r.amount, 0), 0
  );
  const sendCount  = wizard.groups.filter((g) => g.selected && g.sendMode === 'send').length;
  const draftCount = wizard.groups.filter((g) => g.selected && g.sendMode === 'draft').length;

  // ── Upload step ─────────────────────────────────────────────────────────────

  if (wizard.step === 'upload') {
    return (
      <div className="max-w-2xl space-y-6">
        <PageHeader
          title="Import from TaxiCaller"
          description="Upload your monthly TaxiCaller .xlsx export to generate invoices for all corporate accounts at once."
        />

        <div className="rounded-2xl bg-white p-6 shadow-sm ring-1 ring-gray-200 space-y-5">
          {/* Month / Year */}
          <div className="grid grid-cols-2 gap-4">
            <Select
              label="Month"
              value={wizard.month}
              onChange={(e) => setWizard((w) => ({ ...w, month: e.target.value }))}
            >
              {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
            </Select>
            <Select
              label="Year"
              value={wizard.year}
              onChange={(e) => setWizard((w) => ({ ...w, year: parseInt(e.target.value) }))}
            >
              {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
            </Select>
          </div>

          {/* Drop zone */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1.5">TaxiCaller Export File</label>
            <div
              onClick={() => fileRef.current?.click()}
              onDragOver={(e) => { e.preventDefault(); setIsDragging(true); }}
              onDragLeave={() => setIsDragging(false)}
              onDrop={(e) => {
                e.preventDefault();
                setIsDragging(false);
                const f = e.dataTransfer.files[0];
                if (f) parseFile(f);
              }}
              className={`cursor-pointer rounded-xl border-2 border-dashed px-6 py-10 text-center transition-colors ${
                isDragging
                  ? 'border-indigo-400 bg-indigo-50'
                  : 'border-gray-200 bg-gray-50 hover:border-indigo-300 hover:bg-indigo-50/50'
              }`}
            >
              <svg className="mx-auto h-10 w-10 text-gray-300" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M3 16.5v2.25A2.25 2.25 0 005.25 21h13.5A2.25 2.25 0 0021 18.75V16.5m-13.5-9L12 3m0 0l4.5 4.5M12 3v13.5" />
              </svg>
              {fileName
                ? <p className="mt-3 text-sm font-medium text-indigo-600">{fileName}</p>
                : <>
                    <p className="mt-3 text-sm font-semibold text-gray-700">Drop your .xlsx file here</p>
                    <p className="mt-1 text-xs text-gray-400">or click to browse — accepts .xlsx files from TaxiCaller</p>
                  </>
              }
            </div>
            <input
              ref={fileRef}
              type="file"
              accept=".xlsx,.xls"
              className="hidden"
              onChange={(e) => { const f = e.target.files?.[0]; if (f) parseFile(f); }}
            />
          </div>

          {wizard.fileError && (
            <p className="rounded-lg bg-red-50 px-4 py-2.5 text-sm text-red-600">{wizard.fileError}</p>
          )}

          <div className="flex justify-end">
            <Button
              variant="primary"
              onClick={() => fileRef.current?.click()}
              disabled={!fileName}
            >
              Parse File →
            </Button>
          </div>
        </div>
      </div>
    );
  }

  // ── Preview step ────────────────────────────────────────────────────────────

  if (wizard.step === 'preview') {
    return (
      <div className="space-y-6">
        <div className="flex items-start justify-between">
          <PageHeader
            title="Preview Import"
            description={`${wizard.month} ${wizard.year} · ${fileName}`}
          />
          <Button variant="ghost" onClick={() => setWizard((w) => ({ ...w, step: 'upload' }))}>← Back</Button>
        </div>

        {/* All-unmatched empty state */}
        {wizard.groups.length === 0 && wizard.unmatched.length > 0 && (
          <div className="rounded-2xl border-2 border-dashed border-amber-200 bg-amber-50 px-8 py-10 text-center">
            <div className="mx-auto mb-4 flex h-14 w-14 items-center justify-center rounded-full bg-amber-100">
              <svg className="h-7 w-7 text-amber-500" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
                <path strokeLinecap="round" strokeLinejoin="round" d="M12 9v3.75m-9.303 3.376c-.866 1.5.217 3.374 1.948 3.374h14.71c1.73 0 2.813-1.874 1.948-3.374L13.949 3.378c-.866-1.5-3.032-1.5-3.898 0L2.697 16.126zM12 15.75h.007v.008H12v-.008z" />
              </svg>
            </div>
            <h3 className="text-base font-semibold text-amber-900">No companies matched</h3>
            <p className="mt-2 text-sm text-amber-700 max-w-md mx-auto">
              None of the Account IDs in this file exist in your Companies database.
              You need to add each company with its exact Account ID from TaxiCaller before importing.
            </p>
            <div className="mt-4 rounded-lg bg-white/70 px-4 py-3 text-left inline-block min-w-[280px]">
              <p className="text-xs font-semibold text-amber-800 mb-2">Account IDs found in this file:</p>
              <div className="space-y-1">
                {wizard.unmatched.map((u) => (
                  <div key={u.accountId} className="flex items-center justify-between gap-4 text-xs">
                    <span className="font-mono text-gray-700">{u.accountId}</span>
                    <span className="text-gray-400">{u.rowCount} ride{u.rowCount !== 1 ? 's' : ''}</span>
                  </div>
                ))}
              </div>
            </div>
            <div className="mt-5 flex justify-center gap-3">
              <Link href="/companies">
                <Button variant="primary">Go to Companies →</Button>
              </Link>
              <Button variant="secondary" onClick={() => setWizard((w) => ({ ...w, step: 'upload' }))}>← Upload Different File</Button>
            </div>
          </div>
        )}

        {/* Partial-unmatched warnings (some matched, some not) */}
        {wizard.groups.length > 0 && wizard.unmatched.length > 0 && (
          <div className="rounded-xl border border-amber-200 bg-amber-50 px-5 py-4 space-y-1">
            <p className="text-sm font-semibold text-amber-800">
              {wizard.unmatched.length} Account ID{wizard.unmatched.length > 1 ? 's' : ''} not found in Companies — rows excluded
            </p>
            {wizard.unmatched.map((u) => (
              <p key={u.accountId} className="text-xs text-amber-700">
                <span className="font-mono font-medium">{u.accountId}</span>{' '}
                ({u.rowCount} row{u.rowCount > 1 ? 's' : ''}) —{' '}
                <Link href="/companies" className="underline hover:text-amber-900">Add it in Companies →</Link>
              </p>
            ))}
          </div>
        )}

        {/* Controls — only shown when there are matched groups */}
        {wizard.groups.length > 0 && (
        <div className="flex flex-wrap items-center gap-3">
          <Select
            value={wizard.month}
            onChange={(e) => setWizard((w) => ({ ...w, month: e.target.value }))}
            className="w-36"
          >
            {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
          </Select>
          <Select
            value={wizard.year}
            onChange={(e) => setWizard((w) => ({ ...w, year: parseInt(e.target.value) }))}
            className="w-28"
          >
            {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
          </Select>
          <div className="flex gap-2 ml-auto">
            <Button size="sm" variant="ghost" onClick={() => selectAll(true)}>Select All</Button>
            <Button size="sm" variant="ghost" onClick={() => selectAll(false)}>Deselect All</Button>
          </div>
        </div>
        )}

        {wizard.groups.length > 0 && (
          <p className="text-xs text-gray-500 -mb-2">
            <span className="font-medium text-gray-700">Tip:</span> Click any field (passenger, phone, pickup, dropoff, cab #, driver, amount) to edit before generating.
          </p>
        )}

        {/* Company groups */}
        {wizard.groups.length > 0 && (
        <div className="space-y-3">
          {wizard.groups.map((group) => {
            const subtotal    = group.rows.reduce((s, r) => s + r.amount, 0);
            const isCollapsed = collapsed.has(group.accountId);

            return (
              <div
                key={group.accountId}
                className={`overflow-hidden rounded-2xl bg-white shadow-sm ring-1 transition-all ${
                  group.selected ? 'ring-gray-200' : 'ring-gray-100 opacity-60'
                }`}
              >
                {/* Group header */}
                <div
                  className="flex items-center gap-3 px-5 py-3.5 cursor-pointer hover:bg-gray-50 transition-colors border-b border-gray-100"
                  onClick={() => toggleCollapse(group.accountId)}
                >
                  <input
                    type="checkbox"
                    checked={group.selected}
                    onChange={() => toggleSelected(group.accountId)}
                    onClick={(e) => e.stopPropagation()}
                    className="h-4 w-4 rounded border-gray-300 text-indigo-600 focus:ring-indigo-500"
                  />
                  <div className="flex-1 min-w-0">
                    <span className="font-semibold text-sm text-gray-900">{group.companyName}</span>
                    <span className="ml-2 font-mono text-xs text-gray-400">{group.accountId}</span>
                  </div>
                  {/* Send / Draft toggle — only clickable when the row is selected */}
                  {group.selected && (
                    <div
                      className="inline-flex rounded-lg bg-gray-100 p-0.5 text-xs"
                      onClick={(e) => e.stopPropagation()}
                    >
                      <button
                        type="button"
                        onClick={() => setSendMode(group.accountId, 'send')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                          group.sendMode === 'send'
                            ? 'bg-white text-emerald-700 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Send
                      </button>
                      <button
                        type="button"
                        onClick={() => setSendMode(group.accountId, 'draft')}
                        className={`px-2.5 py-1 rounded-md font-medium transition-colors ${
                          group.sendMode === 'draft'
                            ? 'bg-white text-amber-700 shadow-sm'
                            : 'text-gray-500 hover:text-gray-700'
                        }`}
                      >
                        Draft
                      </button>
                    </div>
                  )}
                  <span className="text-xs text-gray-400">{group.rows.length} ride{group.rows.length !== 1 ? 's' : ''}</span>
                  <span className="text-sm font-semibold text-gray-700">{formatCurrency(subtotal)}</span>
                  <svg
                    className={`h-4 w-4 text-gray-400 transition-transform ${isCollapsed ? '' : 'rotate-180'}`}
                    fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}
                  >
                    <path strokeLinecap="round" strokeLinejoin="round" d="M19 9l-7 7-7-7" />
                  </svg>
                </div>

                {/* Rides table */}
                {!isCollapsed && (
                  <table className="w-full">
                    <thead>
                      <tr className="bg-gray-50">
                        {['Date/Time', 'Passenger', 'Phone', 'Pickup', 'Dropoff', 'Cab #', 'Driver', 'Payable', ''].map((h, i) => (
                          <th key={i} className="px-3 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">
                            {h}
                          </th>
                        ))}
                      </tr>
                    </thead>
                    <tbody className="divide-y divide-gray-50">
                      {group.rows.map((r) => (
                        <tr key={r.rowIndex} className="hover:bg-gray-50 transition-colors align-top">
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.dateTime}
                              onChange={(e) => updateRowField(group.accountId, r.rowIndex, 'dateTime', e.target.value)}
                              className="w-36 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-mono text-gray-700 hover:border-gray-200 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.passenger}
                              onChange={(e) => updateRowField(group.accountId, r.rowIndex, 'passenger', e.target.value)}
                              className="w-32 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-gray-700 hover:border-gray-200 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.customerPhone}
                              onChange={(e) => updateRowField(group.accountId, r.rowIndex, 'customerPhone', e.target.value)}
                              placeholder="—"
                              className="w-28 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-gray-700 hover:border-gray-200 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.pickupLocation}
                              onChange={(e) => updateRowField(group.accountId, r.rowIndex, 'pickupLocation', e.target.value)}
                              className="w-52 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-gray-700 hover:border-gray-200 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.dropoffLocation}
                              onChange={(e) => updateRowField(group.accountId, r.rowIndex, 'dropoffLocation', e.target.value)}
                              className="w-52 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-gray-700 hover:border-gray-200 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.vehicleNumber}
                              onChange={(e) => updateRowField(group.accountId, r.rowIndex, 'vehicleNumber', e.target.value)}
                              className="w-16 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs font-mono text-gray-700 hover:border-gray-200 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="text"
                              value={r.driver}
                              onChange={(e) => updateRowField(group.accountId, r.rowIndex, 'driver', e.target.value)}
                              className="w-28 rounded-md border border-transparent bg-transparent px-2 py-1 text-xs text-gray-700 hover:border-gray-200 focus:border-indigo-400 focus:bg-white focus:outline-none focus:ring-1 focus:ring-indigo-400"
                            />
                          </td>
                          <td className="px-3 py-2">
                            <input
                              type="number"
                              step="0.01"
                              min="0"
                              value={r.amount}
                              onChange={(e) => updateAmount(group.accountId, r.rowIndex, e.target.value)}
                              className="w-24 rounded-lg border border-gray-200 px-2 py-1 text-right text-xs font-semibold text-gray-900 focus:outline-none focus:ring-2 focus:ring-indigo-400 focus:border-transparent"
                            />
                          </td>
                          <td className="px-3 py-2 text-right">
                            <button
                              type="button"
                              onClick={() => deleteRow(group.accountId, r.rowIndex)}
                              title="Remove this ride from the import"
                              className="rounded-md border border-transparent px-2 py-1 text-xs font-medium text-red-500 hover:border-red-200 hover:bg-red-50"
                            >
                              ✕
                            </button>
                          </td>
                        </tr>
                      ))}
                    </tbody>
                    <tfoot>
                      <tr className="bg-gray-50 border-t border-gray-100">
                        <td colSpan={2} className="px-4 py-2">
                          <button
                            type="button"
                            onClick={() => addRow(group.accountId)}
                            className="text-xs font-semibold text-indigo-600 hover:text-indigo-800"
                          >
                            + Add ride
                          </button>
                        </td>
                        <td colSpan={5} className="px-4 py-2.5 text-xs font-semibold text-gray-500 text-right">Subtotal</td>
                        <td className="px-4 py-2.5 text-sm font-bold text-gray-900">{formatCurrency(subtotal)}</td>
                        <td></td>
                      </tr>
                    </tfoot>
                  </table>
                )}
              </div>
            );
          })}
        </div>

        )} {/* end wizard.groups.length > 0 groups list */}

        {/* Grand total + submit — only when there are matched groups */}
        {wizard.groups.length > 0 && (
        <div className="rounded-2xl bg-white px-6 py-4 shadow-sm ring-1 ring-gray-200 flex items-center justify-between">
          <div>
            <p className="text-xs text-gray-500">
              {selectedCount} of {wizard.groups.length} compan{wizard.groups.length !== 1 ? 'ies' : 'y'} · {selectedRides} ride{selectedRides !== 1 ? 's' : ''}
              {selectedCount > 0 && (
                <>
                  {' · '}
                  <span className="text-emerald-700">{sendCount} sending</span>
                  {draftCount > 0 && <> · <span className="text-amber-700">{draftCount} draft</span></>}
                </>
              )}
            </p>
            <p className="text-xl font-bold text-gray-900 mt-0.5">Grand Total: {formatCurrency(grandTotal)}</p>
          </div>
          <div className="flex items-center gap-3">
            {wizard.fileError && (
              <p className="text-sm text-red-600">{wizard.fileError}</p>
            )}
            <Button
              variant="primary"
              onClick={handleSubmit}
              disabled={wizard.submitting || selectedCount === 0}
            >
              {wizard.submitting
                ? <span className="flex items-center gap-2"><Spinner /> Generating…</span>
                : 'Confirm & Generate Invoices'}
            </Button>
          </div>
        </div>
        )} {/* end wizard.groups.length > 0 grand total */}
      </div>
    );
  }

  // ── Results step ────────────────────────────────────────────────────────────

  const successes = wizard.results.filter((r) => r.status === 'success');
  const errors    = wizard.results.filter((r) => r.status === 'error');

  return (
    <div className="max-w-3xl space-y-6">
      <PageHeader
        title={successes.length > 0 ? 'Import Complete' : 'Import Failed'}
        description={`${successes.length} invoice${successes.length !== 1 ? 's' : ''} generated${errors.length > 0 ? ` · ${errors.length} error${errors.length !== 1 ? 's' : ''}` : ''} — ${wizard.month} ${wizard.year}`}
      />

      <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
        {wizard.results.map((r, i) => (
          <div
            key={i}
            className={`flex items-start gap-4 px-6 py-4 border-b border-gray-50 last:border-0 ${
              r.status === 'error' ? 'bg-red-50' : ''
            }`}
          >
            {/* Status icon */}
            <div className={`mt-0.5 flex h-6 w-6 shrink-0 items-center justify-center rounded-full ${
              r.status === 'success' ? 'bg-emerald-100' : 'bg-red-100'
            }`}>
              {r.status === 'success'
                ? <svg className="h-3.5 w-3.5 text-emerald-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M5 13l4 4L19 7" /></svg>
                : <svg className="h-3.5 w-3.5 text-red-600" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2.5}><path strokeLinecap="round" strokeLinejoin="round" d="M6 18L18 6M6 6l12 12" /></svg>
              }
            </div>

            {/* Content */}
            <div className="flex-1 min-w-0">
              <div className="flex items-center gap-2 flex-wrap">
                <span className="font-semibold text-sm text-gray-900">{r.companyName}</span>
                {r.status === 'success' && (
                  <>
                    <span className="text-xs font-mono text-gray-400">Invoice #{r.invoiceNumber}</span>
                    <span className="text-sm font-semibold text-gray-700">{formatCurrency(r.amountTotal ?? 0)}</span>
                    {r.sentAs === 'draft' ? (
                      <span className="inline-flex items-center rounded-full bg-amber-50 px-2 py-0.5 text-xs font-medium text-amber-700">
                        Draft — not sent
                      </span>
                    ) : r.flagged ? (
                      <Badge variant="flagged" />
                    ) : (
                      <Badge variant="pending" />
                    )}
                  </>
                )}
              </div>
              {r.status === 'success' && r.flagged && (
                <p className="mt-0.5 text-xs text-amber-600">Fewer rides than expected — review before sending</p>
              )}
              {r.status === 'success' && (r.duplicatesSkipped ?? 0) > 0 && (
                <p className="mt-0.5 text-xs text-gray-400">{r.duplicatesSkipped} duplicate ride{(r.duplicatesSkipped ?? 0) !== 1 ? 's' : ''} skipped</p>
              )}
              {r.status === 'error' && (
                <p className="mt-0.5 text-xs text-red-600">{r.error}</p>
              )}
              {/* Surface SMTP send failures from import — invoice still
                  exists, just the email didn't reach the recipient. */}
              {r.status === 'success' && r.emailError && (
                <p className="mt-1 rounded-md bg-amber-50 px-2 py-1 text-xs text-amber-800 ring-1 ring-amber-200">
                  ⚠ Invoice created, but email could not be sent: <span className="font-mono">{r.emailError}</span>
                </p>
              )}
            </div>

            {/* Action */}
            {r.status === 'success' && r.invoiceId && (
              <Link href={`/invoices/${r.invoiceId}`}>
                <Button size="sm" variant="ghost">View →</Button>
              </Link>
            )}
          </div>
        ))}
      </div>

      <div className="flex gap-3">
        <Button variant="secondary" onClick={() => { setWizard(INITIAL); setFileName(''); }}>
          Import Another File
        </Button>
        <Link href="/invoices">
          <Button variant="primary">View All Invoices →</Button>
        </Link>
      </div>
    </div>
  );
}
