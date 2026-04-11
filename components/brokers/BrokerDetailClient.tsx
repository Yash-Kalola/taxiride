'use client';
import { useState, useMemo } from 'react';
import { useRouter } from 'next/navigation';
import Link from 'next/link';
import { format } from 'date-fns';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import { formatCurrency } from '@/lib/tax';
import { MONTHS, YEARS } from '@/lib/constants';

interface Transaction {
  id: string; brokerId: string; type: string; amount: number;
  status: string; dueDate: string | null; paidDate: string | null;
  description: string; month: number; year: number; createdAt: string; updatedAt: string;
}

interface BrokerVehicle { id: string; cabNumber: string; isCompanyCar: boolean; insuranceAmount: number; isActive: boolean; }
interface BrokerExpense  { id: string; cabNumber: string; date: string; amount: number; note: string; createdAt: string; }

interface Broker {
  id: string; name: string; phone: string; billingDay: number;
  startDate: string; endDate: string | null; isActive: boolean;
  transactions: Transaction[];
  vehicles: BrokerVehicle[];
  expenses: BrokerExpense[];
}

const TYPE_LABELS: Record<string, string> = {
  STAND_RENT:      'Stand Rent',
  COMPANY_PAYMENT: 'Company Payment',
  PRODUCT_CHARGE:  'Product Charge',
  INSURANCE:       'Insurance',
  PAYOUT:          'Payout',
  OTHER:           'Other',
};

const TX_TYPES = ['STAND_RENT', 'COMPANY_PAYMENT', 'PRODUCT_CHARGE', 'INSURANCE', 'PAYOUT', 'OTHER'] as const;

function txBadgeVariant(tx: Transaction): 'paid' | 'pending' | 'overdue' {
  if (tx.status === 'PAID') return 'paid';
  if (tx.dueDate && new Date(tx.dueDate) < new Date()) return 'overdue';
  return 'pending';
}

const EMPTY_TX = {
  type: 'STAND_RENT' as string,
  amount: '200',
  description: '',
  dueDate: '',
  month: String(new Date().getMonth() + 1),
  year:  String(new Date().getFullYear()),
};

const EMPTY_BROKER = { name: '', phone: '', billingDay: '1', startDate: '' };

function ordinal(n: number): string {
  const s = ['th', 'st', 'nd', 'rd'];
  const v = n % 100;
  return n + (s[(v - 20) % 10] ?? s[v] ?? s[0]);
}

export default function BrokerDetailClient({ broker: initial }: { broker: Broker }) {
  const router = useRouter();
  const [broker,        setBroker]       = useState<Broker>(initial);
  const [transactions,  setTransactions] = useState<Transaction[]>(initial.transactions);
  const [showAddTx,     setShowAddTx]    = useState(false);
  const [showEditTx,    setShowEditTx]   = useState(false);
  const [editingTx,     setEditingTx]    = useState<Transaction | null>(null);
  const [showEditBroker,setShowEdit]     = useState(false);
  const [txForm,        setTxForm]       = useState(EMPTY_TX);
  const [brokerForm,    setBrokerForm]   = useState(EMPTY_BROKER);
  const [savingTx,      setSavingTx]     = useState(false);
  const [savingBroker,  setSavingBroker] = useState(false);
  const [generatingWeekly, setGenWeekly] = useState(false);
  const [txError,       setTxError]      = useState('');
  const [brokerError,   setBrokerError]  = useState('');
  const [filterMonth,   setFilterMonth]  = useState('');
  const [filterYear,    setFilterYear]   = useState('');
  const [expenses,     setExpenses]     = useState<BrokerExpense[]>(initial.expenses ?? []);
  const [showAddExp,   setShowAddExp]   = useState(false);
  const [expForm,      setExpForm]      = useState({ cabNumber: '', date: new Date().toISOString().split('T')[0], amount: '', note: '' });
  const [savingExp,    setSavingExp]    = useState(false);
  const [expError,     setExpError]     = useState('');

  const today = new Date();
  const thisMonth = today.getMonth() + 1;
  const thisYear  = today.getFullYear();

  // Summary card computations
  const owedToUs = useMemo(() =>
    transactions.filter((t) => t.type !== 'PAYOUT' && t.status === 'PENDING').reduce((s, t) => s + t.amount, 0),
  [transactions]);

  const weOweThem = useMemo(() =>
    transactions.filter((t) => t.type === 'PAYOUT' && t.status === 'PENDING').reduce((s, t) => s + t.amount, 0),
  [transactions]);

  const collectedThisMonth = useMemo(() =>
    transactions.filter((t) => t.type !== 'PAYOUT' && t.status === 'PAID' && t.month === thisMonth && t.year === thisYear)
      .reduce((s, t) => s + t.amount, 0),
  [transactions, thisMonth, thisYear]);

  const paidOutThisMonth = useMemo(() =>
    transactions.filter((t) => t.type === 'PAYOUT' && t.status === 'PAID' && t.month === thisMonth && t.year === thisYear)
      .reduce((s, t) => s + t.amount, 0),
  [transactions, thisMonth, thisYear]);

  // Filtered + sorted transactions
  const displayed = useMemo(() => {
    return transactions.filter((t) => {
      if (filterMonth && String(t.month) !== filterMonth) return false;
      if (filterYear  && String(t.year)  !== filterYear)  return false;
      return true;
    });
  }, [transactions, filterMonth, filterYear]);

  // Monthly charge generation status
  const thisMonthStandRentCount = useMemo(() =>
    transactions.filter((t) => t.type === 'STAND_RENT' && t.month === thisMonth && t.year === thisYear).length,
  [transactions, thisMonth, thisYear]);

  const billingDue = useMemo(() => {
    // Billing is due if today >= billing day AND no stand rent generated this month
    return today.getDate() >= broker.billingDay && thisMonthStandRentCount === 0;
  }, [today, broker.billingDay, thisMonthStandRentCount]);

  const [generatingMonthly, setGeneratingMonthly] = useState(false);
  const [showGeneratePreview, setShowGeneratePreview] = useState(false);

  const generatePreviewItems = useMemo(() => {
    const activeVehicles = broker.vehicles.filter((v) => v.isActive);
    const vehicleCount   = activeVehicles.length || 1;
    const items: { label: string; amount: number }[] = [];
    for (let week = 1; week <= 4; week++) {
      const rate = week === 1 ? 200 : 230;
      items.push({
        label:  `Week ${week} Stand Rent — ${vehicleCount} cab${vehicleCount !== 1 ? 's' : ''} × $${rate}`,
        amount: rate * vehicleCount,
      });
    }
    const companyCabs = activeVehicles.filter((v) => v.isCompanyCar && v.insuranceAmount > 0);
    for (const cab of companyCabs) {
      items.push({ label: `Insurance — Cab #${cab.cabNumber}`, amount: cab.insuranceAmount });
    }
    return items;
  }, [broker.vehicles]);

  async function generateMonthlyCharges() {
    setGeneratingMonthly(true); setTxError('');
    try {
      const activeVehicles = broker.vehicles.filter((v) => v.isActive);
      const vehicleCount   = activeVehicles.length || 1;
      const newTxs: Transaction[] = [];

      for (let week = 1; week <= 4; week++) {
        const rate   = week === 1 ? 200 : 230;
        const amount = rate * vehicleCount;
        const desc   = `Week ${week} (${vehicleCount} cab${vehicleCount !== 1 ? 's' : ''} × $${rate})`;
        const res = await fetch(`/api/brokers/${broker.id}/transactions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'STAND_RENT', amount, description: desc, month: thisMonth, year: thisYear }),
        });
        if (res.ok) newTxs.push(await res.json());
      }

      // Auto-add insurance for company-subleased vehicles
      const companyCabs = activeVehicles.filter((v) => v.isCompanyCar && v.insuranceAmount > 0);
      for (const cab of companyCabs) {
        const res = await fetch(`/api/brokers/${broker.id}/transactions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'INSURANCE', amount: cab.insuranceAmount,
            description: `Insurance – Cab #${cab.cabNumber}`,
            month: thisMonth, year: thisYear,
          }),
        });
        if (res.ok) newTxs.push(await res.json());
      }

      setTransactions((prev) => [...newTxs.reverse(), ...prev]);
    } catch { setTxError('Network error'); }
    finally { setGeneratingMonthly(false); }
  }

  // --- Broker edit ---
  function openEditBroker() {
    setBrokerForm({
      name:       broker.name,
      phone:      broker.phone,
      billingDay: String(broker.billingDay),
      startDate:  broker.startDate ? broker.startDate.split('T')[0] : '',
    });
    setBrokerError(''); setShowEdit(true);
  }

  async function saveBroker() {
    setSavingBroker(true); setBrokerError('');
    try {
      const payload = { ...brokerForm, billingDay: parseInt(brokerForm.billingDay) || 1 };
      const res  = await fetch(`/api/brokers/${broker.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data = await res.json();
      if (!res.ok) { setBrokerError(data.error ?? 'Failed'); return; }
      setBroker((prev) => ({ ...prev, ...data }));
      setShowEdit(false);
    } catch { setBrokerError('Network error'); }
    finally { setSavingBroker(false); }
  }

  async function toggleActive() {
    const data = broker.isActive
      ? { isActive: false, endDate: new Date().toISOString() }
      : { isActive: true,  endDate: null };
    const res = await fetch(`/api/brokers/${broker.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(data) });
    if (res.ok) { const d = await res.json(); setBroker((prev) => ({ ...prev, ...d })); }
  }

  // --- Add transaction ---
  function openAddTx() { setTxForm(EMPTY_TX); setTxError(''); setShowAddTx(true); }

  // --- Edit transaction ---
  function openEditTx(tx: Transaction) {
    setTxForm({
      type:        tx.type,
      amount:      String(tx.amount),
      description: tx.description,
      dueDate:     tx.dueDate ? tx.dueDate.split('T')[0] : '',
      month:       String(tx.month),
      year:        String(tx.year),
    });
    setEditingTx(tx); setTxError(''); setShowEditTx(true);
  }

  async function saveEditTx() {
    if (!editingTx) return;
    setSavingTx(true); setTxError('');
    try {
      const res  = await fetch(`/api/brokers/transactions/${editingTx.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...txForm, amount: parseFloat(txForm.amount) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { setTxError(data.error ?? 'Failed'); return; }
      setTransactions((prev) => prev.map((t) => t.id === editingTx.id ? data : t));
      setShowEditTx(false);
    } catch { setTxError('Network error'); }
    finally { setSavingTx(false); }
  }

  async function saveTx() {
    setSavingTx(true); setTxError('');
    try {
      const res  = await fetch(`/api/brokers/${broker.id}/transactions`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...txForm, amount: parseFloat(txForm.amount) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { setTxError(data.error ?? 'Failed'); return; }
      setTransactions((prev) => [data, ...prev]);
      setShowAddTx(false);
    } catch { setTxError('Network error'); }
    finally { setSavingTx(false); }
  }

  async function generateWeeklyStandRent() {
    setGenWeekly(true); setTxError('');
    try {
      const month = parseInt(txForm.month);
      const year  = parseInt(txForm.year);
      const activeVehicles = broker.vehicles.filter((v) => v.isActive);
      const vehicleCount   = activeVehicles.length || 1;
      const newTxs: Transaction[] = [];

      for (let week = 1; week <= 4; week++) {
        const rate   = week === 1 ? 200 : 230;
        const amount = rate * vehicleCount;
        const desc   = `Week ${week} (${vehicleCount} cab${vehicleCount !== 1 ? 's' : ''} × $${rate})`;
        const res = await fetch(`/api/brokers/${broker.id}/transactions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'STAND_RENT', amount, description: desc, month, year }),
        });
        if (res.ok) newTxs.push(await res.json());
      }

      // Auto-add insurance for company-subleased vehicles
      const companyCabs = activeVehicles.filter((v) => v.isCompanyCar && v.insuranceAmount > 0);
      for (const cab of companyCabs) {
        const res = await fetch(`/api/brokers/${broker.id}/transactions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({
            type: 'INSURANCE', amount: cab.insuranceAmount,
            description: `Insurance – Cab #${cab.cabNumber}`,
            month, year,
          }),
        });
        if (res.ok) newTxs.push(await res.json());
      }

      setTransactions((prev) => [...newTxs.reverse(), ...prev]);
      setShowAddTx(false);
    } catch { setTxError('Network error'); }
    finally { setGenWeekly(false); }
  }

  // --- Transaction actions ---
  async function markPaid(txId: string) {
    const res = await fetch(`/api/brokers/transactions/${txId}/pay`, { method: 'PATCH' });
    if (res.ok) {
      const updated = await res.json();
      setTransactions((prev) => prev.map((t) => t.id === txId ? updated : t));
    }
  }

  async function markUnpaid(txId: string) {
    const res = await fetch(`/api/brokers/transactions/${txId}/pay`, { method: 'DELETE' });
    if (res.ok) {
      const updated = await res.json();
      setTransactions((prev) => prev.map((t) => t.id === txId ? updated : t));
    }
  }

  async function deleteTx(txId: string) {
    if (!confirm('Delete this transaction? This cannot be undone.')) return;
    const res = await fetch(`/api/brokers/transactions/${txId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setTransactions((prev) => prev.filter((t) => t.id !== txId));
    }
  }

  function openAddExp() {
    setExpForm({ cabNumber: '', date: new Date().toISOString().split('T')[0], amount: '', note: '' });
    setExpError(''); setShowAddExp(true);
  }

  async function saveExp() {
    setSavingExp(true); setExpError('');
    try {
      const res  = await fetch(`/api/brokers/${broker.id}/expenses`, {
        method: 'POST', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ ...expForm, amount: parseFloat(expForm.amount) || 0 }),
      });
      const data = await res.json();
      if (!res.ok) { setExpError(data.error ?? 'Failed'); return; }
      setExpenses((prev) => [data, ...prev]);
      setShowAddExp(false);
    } catch { setExpError('Network error'); }
    finally { setSavingExp(false); }
  }

  async function deleteExp(expId: string) {
    if (!confirm('Delete this expense?')) return;
    const res = await fetch(`/api/brokers/expenses/${expId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) setExpenses((prev) => prev.filter((e) => e.id !== expId));
  }

  const txField = (key: keyof typeof EMPTY_TX) => ({
    value: txForm[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.value;
      setTxForm((f) => {
        const updated = { ...f, [key]: val };
        // Auto-fill amount when switching to STAND_RENT
        if (key === 'type' && val === 'STAND_RENT') {
          const vehicleCount = broker.vehicles.filter((v) => v.isActive).length || 1;
          updated.amount = String(200 * vehicleCount);
        }
        return updated;
      });
    },
  });

  const brokerField = (key: keyof typeof EMPTY_BROKER) => ({
    value: brokerForm[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement>) =>
      setBrokerForm((f) => ({ ...f, [key]: e.target.value })),
  });

  return (
    <>
      {/* Back link */}
      <Link href="/brokers" className="inline-flex items-center gap-1.5 text-sm text-gray-500 hover:text-gray-700 mb-2">
        <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={2}>
          <path strokeLinecap="round" strokeLinejoin="round" d="M15 19l-7-7 7-7" />
        </svg>
        Brokers
      </Link>

      {/* Broker info card */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 px-6 py-5">
        <div className="flex items-start justify-between">
          <div className="space-y-1">
            <div className="flex items-center gap-3">
              <h1 className="text-2xl font-bold tracking-tight text-gray-900">{broker.name}</h1>
              <Badge variant={broker.isActive ? 'active' : 'inactive'} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
              {broker.phone && <span>📞 {broker.phone}</span>}
              <span>Started: {broker.startDate ? format(new Date(broker.startDate), 'MMM d, yyyy') : '—'}</span>
              {broker.endDate && <span>Ended: {format(new Date(broker.endDate), 'MMM d, yyyy')}</span>}
              <span className={`inline-flex items-center gap-1 ${billingDue ? 'text-amber-600 font-medium' : ''}`}>
                🗓 Billing: {ordinal(broker.billingDay)} of each month
                {billingDue && <span className="ml-1 rounded-full bg-amber-100 px-1.5 py-0.5 text-xs font-semibold text-amber-700">Due</span>}
              </span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {billingDue && (
              <Button
                variant="primary"
                size="sm"
                onClick={() => setShowGeneratePreview(true)}
                disabled={generatingMonthly}
                className="bg-amber-500 hover:bg-amber-600 border-amber-500"
              >
                {generatingMonthly ? 'Generating…' : `⚡ Generate ${MONTHS[thisMonth - 1]} Charges`}
              </Button>
            )}
            {!billingDue && thisMonthStandRentCount === 0 && today.getDate() < broker.billingDay && (
              <Button variant="secondary" size="sm" onClick={() => setShowGeneratePreview(true)} disabled={generatingMonthly}>
                {generatingMonthly ? 'Generating…' : `Generate ${MONTHS[thisMonth - 1]} Charges`}
              </Button>
            )}
            <Button variant="ghost" size="sm" onClick={openEditBroker}>Edit</Button>
            <Button
              variant="ghost" size="sm" onClick={toggleActive}
              className={broker.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}
            >
              {broker.isActive ? 'Deactivate' : 'Reactivate'}
            </Button>
          </div>
        </div>
      </div>

      {/* Vehicles */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 px-6 py-4">
        <div className="flex items-center justify-between mb-3">
          <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Assigned Vehicles</p>
          <Link href="/vehicles" className="text-xs font-medium text-indigo-600 hover:text-indigo-700">Manage →</Link>
        </div>
        {broker.vehicles.length === 0 ? (
          <p className="text-sm text-gray-400">No vehicles assigned. <Link href="/vehicles" className="text-indigo-600 hover:underline">Add one →</Link></p>
        ) : (
          <div className="flex flex-wrap gap-2">
            {broker.vehicles.map((v) => (
              <span key={v.id} className={`inline-flex items-center gap-1.5 rounded-full px-3 py-1 text-xs font-medium ${
                v.isCompanyCar ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20' : 'bg-gray-100 text-gray-700 ring-1 ring-gray-400/20'
              } ${!v.isActive ? 'opacity-50' : ''}`}>
                <span className="font-mono font-bold">#{v.cabNumber}</span>
                <span className="text-gray-400">·</span>
                <span>{v.isCompanyCar ? 'Company' : 'Broker'}</span>
              </span>
            ))}
          </div>
        )}
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Owed To Us',           value: owedToUs,           color: 'text-indigo-600' },
          { label: 'We Owe Them',           value: weOweThem,          color: 'text-amber-600'  },
          { label: `Collected (${MONTHS[thisMonth - 1]})`, value: collectedThisMonth, color: 'text-emerald-600'},
          { label: `Paid Out (${MONTHS[thisMonth - 1]})`,  value: paidOutThisMonth,   color: 'text-rose-600'   },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{c.label}</p>
            <p className={`mt-1.5 text-2xl font-bold ${c.color}`}>{formatCurrency(c.value)}</p>
          </div>
        ))}
      </div>

      {/* Transactions section */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <div className="flex items-center gap-3">
            <h2 className="text-lg font-semibold text-gray-900">Transactions</h2>
            {/* Month/Year filters */}
            <select
              value={filterMonth}
              onChange={(e) => setFilterMonth(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Months</option>
              {Array.from({ length: 12 }, (_, i) => (
                <option key={i + 1} value={String(i + 1)}>{MONTHS[i]}</option>
              ))}
            </select>
            <select
              value={filterYear}
              onChange={(e) => setFilterYear(e.target.value)}
              className="h-9 rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            >
              <option value="">All Years</option>
              {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </select>
          </div>
          <Button variant="primary" onClick={openAddTx}>+ Add Transaction</Button>
        </div>

        {displayed.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-14 text-center">
            <p className="text-base font-semibold text-gray-900">No transactions</p>
            <p className="mt-1 text-sm text-gray-500">{filterMonth || filterYear ? 'Try clearing the filters.' : 'Add the first transaction above.'}</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Date', 'Type', 'Description', 'Period', 'Amount', 'Due Date', 'Status', 'Actions'].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {displayed.map((tx) => {
                  const bv = txBadgeVariant(tx);
                  return (
                    <tr key={tx.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-4 py-3.5 text-sm text-gray-500 whitespace-nowrap">
                        {format(new Date(tx.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
                          {TYPE_LABELS[tx.type] ?? tx.type}
                        </span>
                      </td>
                      <td className="px-4 py-3.5 text-sm text-gray-600 max-w-[180px] truncate">{tx.description || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{MONTHS[tx.month - 1]} {tx.year}</td>
                      <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{formatCurrency(tx.amount)}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">
                        {tx.dueDate ? format(new Date(tx.dueDate), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3.5"><Badge variant={bv} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          <Button size="sm" variant="ghost" onClick={() => openEditTx(tx)}
                            className="opacity-0 group-hover:opacity-100">Edit</Button>
                          {tx.status !== 'PAID' && (
                            <Button size="sm" variant="ghost" onClick={() => markPaid(tx.id)}
                              className="text-emerald-600 hover:bg-emerald-50">Mark Paid</Button>
                          )}
                          {tx.status === 'PAID' && (
                            <Button size="sm" variant="ghost" onClick={() => markUnpaid(tx.id)}
                              className="opacity-0 group-hover:opacity-100 text-amber-600 hover:bg-amber-50">Undo Paid</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => deleteTx(tx.id)}
                            className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50">
                            Delete
                          </Button>
                        </div>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
            </div>
          </div>
        )}
      </div>

      {/* Expenses */}
      <div className="space-y-4">
        <div className="flex items-center justify-between">
          <h2 className="text-lg font-semibold text-gray-900">Expenses</h2>
          <Button variant="secondary" onClick={openAddExp}>+ Add Expense</Button>
        </div>
        {expenses.length === 0 ? (
          <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-10 text-center">
            <p className="text-sm font-semibold text-gray-900">No expenses</p>
            <p className="mt-1 text-xs text-gray-500">Log expenses when the broker takes something from the company.</p>
          </div>
        ) : (
          <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Date', 'Cab #', 'Amount', 'Note', ''].map((h) => (
                    <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {expenses.map((e) => (
                  <tr key={e.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-4 py-3.5 text-sm text-gray-600 whitespace-nowrap">
                      {new Date(e.date).toLocaleDateString('en-CA')}
                    </td>
                    <td className="px-4 py-3.5 font-mono text-sm text-gray-700">{e.cabNumber || '—'}</td>
                    <td className="px-4 py-3.5 text-sm font-semibold text-gray-900">{formatCurrency(e.amount)}</td>
                    <td className="px-4 py-3.5 text-sm text-gray-600 max-w-[220px] truncate">{e.note || '—'}</td>
                    <td className="px-4 py-3.5">
                      <Button size="sm" variant="ghost" onClick={() => deleteExp(e.id)}
                        className="opacity-0 group-hover:opacity-100 text-red-500 hover:text-red-700 hover:bg-red-50">Delete</Button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Add Expense Modal */}
      <Modal open={showAddExp} onClose={() => setShowAddExp(false)} title="Add Expense">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Cab #</label>
              {broker.vehicles.length > 0 ? (
                <select
                  value={expForm.cabNumber}
                  onChange={(e) => setExpForm((f) => ({ ...f, cabNumber: e.target.value }))}
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                >
                  <option value="">— Select cab —</option>
                  {broker.vehicles.map((v) => <option key={v.id} value={v.cabNumber}>#{v.cabNumber}</option>)}
                </select>
              ) : (
                <input
                  type="text"
                  value={expForm.cabNumber}
                  onChange={(e) => setExpForm((f) => ({ ...f, cabNumber: e.target.value }))}
                  placeholder="e.g. 11"
                  className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
                />
              )}
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={expForm.date}
                onChange={(e) => setExpForm((f) => ({ ...f, date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Amount ($)</label>
            <input type="number" min={0} step={0.01} value={expForm.amount}
              onChange={(e) => setExpForm((f) => ({ ...f, amount: e.target.value }))}
              placeholder="0.00"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Note</label>
            <input type="text" value={expForm.note}
              onChange={(e) => setExpForm((f) => ({ ...f, note: e.target.value }))}
              placeholder="What did the broker take?"
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {expError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{expError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAddExp(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveExp} disabled={savingExp || !expForm.amount || !expForm.date}>
              {savingExp ? 'Saving…' : 'Add Expense'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Add Transaction Modal */}
      <Modal open={showAddTx} onClose={() => setShowAddTx(false)} title="Add Transaction" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Type" {...txField('type')}>
              {TX_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </Select>
            <Input label="Amount ($)" type="number" min={0} step={0.01} {...txField('amount')} />
          </div>
          <Input label="Description" placeholder="Optional note…" {...txField('description')} />
          <div className="grid grid-cols-3 gap-4">
            <Select label="Month" {...txField('month')}>
              {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </Select>
            <Select label="Year" {...txField('year')}>
              {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </Select>
            <Input label="Due Date" type="date" {...txField('dueDate')} />
          </div>

          {txError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{txError}</p>}

          <div className="flex justify-between items-center pt-2">
            {/* Stand rent shortcut */}
            {txForm.type === 'STAND_RENT' && (
              <Button variant="secondary" onClick={generateWeeklyStandRent} disabled={generatingWeekly}>
                {generatingWeekly ? 'Generating…' : 'Generate 4 Weekly Entries ($200 each)'}
              </Button>
            )}
            {txForm.type !== 'STAND_RENT' && <div />}
            <div className="flex gap-2">
              <Button variant="ghost" onClick={() => setShowAddTx(false)}>Cancel</Button>
              <Button variant="primary" onClick={saveTx} disabled={savingTx}>
                {savingTx ? 'Saving…' : 'Add Transaction'}
              </Button>
            </div>
          </div>
        </div>
      </Modal>

      {/* Edit Transaction Modal */}
      <Modal open={showEditTx} onClose={() => setShowEditTx(false)} title="Edit Transaction" size="lg">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Select label="Type" {...txField('type')}>
              {TX_TYPES.map((t) => <option key={t} value={t}>{TYPE_LABELS[t]}</option>)}
            </Select>
            <Input label="Amount ($)" type="number" min={0} step={0.01} {...txField('amount')} />
          </div>
          <Input label="Description" placeholder="Optional note…" {...txField('description')} />
          <div className="grid grid-cols-3 gap-4">
            <Select label="Month" {...txField('month')}>
              {MONTHS.map((m, i) => <option key={m} value={String(i + 1)}>{m}</option>)}
            </Select>
            <Select label="Year" {...txField('year')}>
              {YEARS.map((y) => <option key={y} value={String(y)}>{y}</option>)}
            </Select>
            <Input label="Due Date" type="date" {...txField('dueDate')} />
          </div>
          {txError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{txError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowEditTx(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveEditTx} disabled={savingTx}>
              {savingTx ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Edit Broker Modal */}
      <Modal open={showEditBroker} onClose={() => setShowEdit(false)} title="Edit Broker">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" placeholder="John Smith" {...brokerField('name')} />
            <Input label="Phone" placeholder="+1 (705) 555-0123" {...brokerField('phone')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Start Date" type="date" {...brokerField('startDate')} />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Billing Day
                <span className="ml-1 text-xs font-normal text-gray-400">(1–31, day charges auto-generate)</span>
              </label>
              <input
                type="number" min={1} max={31}
                value={brokerForm.billingDay}
                onChange={(e) => setBrokerForm((f) => ({ ...f, billingDay: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {brokerForm.billingDay && (
                <p className="mt-1 text-xs text-gray-400">
                  Charges become due on the {ordinal(parseInt(brokerForm.billingDay) || 1)} of each month. The Generate button highlights amber on or after this day when no charges have been created yet.
                </p>
              )}
            </div>
          </div>
          {brokerError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{brokerError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveBroker} disabled={savingBroker || !brokerForm.name}>
              {savingBroker ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Generate Charges Preview Modal */}
      <Modal open={showGeneratePreview} onClose={() => setShowGeneratePreview(false)} title={`Generate ${MONTHS[thisMonth - 1]} ${thisYear} Charges`}>
        <div className="space-y-4">
          <p className="text-sm text-gray-600">
            The following transactions will be created for <span className="font-semibold">{broker.name}</span>:
          </p>
          <div className="rounded-xl border border-gray-200 overflow-hidden">
            <table className="w-full text-sm">
              <thead>
                <tr className="bg-gray-50 border-b border-gray-200">
                  <th className="px-4 py-2.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">Description</th>
                  <th className="px-4 py-2.5 text-right text-xs font-semibold uppercase tracking-wide text-gray-400">Amount</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100">
                {generatePreviewItems.map((item, i) => (
                  <tr key={i}>
                    <td className="px-4 py-2.5 text-gray-700">{item.label}</td>
                    <td className="px-4 py-2.5 text-right font-semibold text-gray-900">{formatCurrency(item.amount)}</td>
                  </tr>
                ))}
              </tbody>
              <tfoot>
                <tr className="bg-gray-50 border-t-2 border-gray-200">
                  <td className="px-4 py-2.5 font-semibold text-gray-700">Total</td>
                  <td className="px-4 py-2.5 text-right font-bold text-indigo-600">
                    {formatCurrency(generatePreviewItems.reduce((s, item) => s + item.amount, 0))}
                  </td>
                </tr>
              </tfoot>
            </table>
          </div>
          {txError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{txError}</p>}
          <div className="flex justify-end gap-2 pt-1">
            <Button variant="ghost" onClick={() => setShowGeneratePreview(false)}>Cancel</Button>
            <Button
              variant="primary"
              onClick={() => { setShowGeneratePreview(false); generateMonthlyCharges(); }}
              disabled={generatingMonthly}
              className="bg-amber-500 hover:bg-amber-600 border-amber-500"
            >
              Confirm & Generate
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
