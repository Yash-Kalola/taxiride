'use client';
import Select from '@/components/ui/Select';
import Button from '@/components/ui/Button';

const MONTHS = ['January','February','March','April','May','June','July','August','September','October','November','December'];
const YEARS = [2024, 2025, 2026, 2027];

interface FilterBarProps {
  year: number;
  month: string;
  companySearch: string;
  statusFilter: string;
  onYearChange: (y: number) => void;
  onMonthChange: (m: string) => void;
  onCompanySearch: (s: string) => void;
  onStatusChange: (s: string) => void;
  onGenerate: () => void;
}

export default function FilterBar({
  year, month, companySearch, statusFilter,
  onYearChange, onMonthChange, onCompanySearch, onStatusChange, onGenerate,
}: FilterBarProps) {
  return (
    <div className="flex flex-wrap items-end gap-3">
      <Select label="Year" value={year} onChange={(e) => onYearChange(parseInt(e.target.value))}>
        {YEARS.map((y) => <option key={y} value={y}>{y}</option>)}
      </Select>

      <Select label="Month" value={month} onChange={(e) => onMonthChange(e.target.value)}>
        <option value="">All Months</option>
        {MONTHS.map((m) => <option key={m} value={m}>{m}</option>)}
      </Select>

      <div className="flex flex-col gap-1">
        <label className="text-xs font-medium text-gray-500 uppercase tracking-wide">Company</label>
        <input
          type="text"
          placeholder="Search company..."
          value={companySearch}
          onChange={(e) => onCompanySearch(e.target.value)}
          className="rounded-md border border-gray-300 px-3 py-2 text-sm text-gray-700 shadow-sm focus:border-gray-900 focus:outline-none focus:ring-1 focus:ring-gray-900 w-48"
        />
      </div>

      <Select label="Status" value={statusFilter} onChange={(e) => onStatusChange(e.target.value)}>
        <option value="All">All</option>
        <option value="Paid">Paid</option>
        <option value="Pending">Pending</option>
      </Select>

      <div className="ml-auto">
        <Button variant="primary" onClick={onGenerate}>
          + Generate Invoice
        </Button>
      </div>
    </div>
  );
}
