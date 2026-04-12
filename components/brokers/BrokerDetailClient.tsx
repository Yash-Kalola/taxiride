'use client';
import { useState, useMemo, useEffect, useRef } from 'react';
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
import { getCurrentWeekNum, getWeeksInMonth } from '@/lib/weeks';

interface Transaction {
  id: string; brokerId: string; type: string; amount: number;
  status: string; dueDate: string | null; paidDate: string | null;
  description: string; month: number; year: number; createdAt: string; updatedAt: string;
}

interface BrokerVehicle { id: string; cabNumber: string; isCompanyCar: boolean; insuranceAmount: number; isActive: boolean; }
interface BrokerExpense { id: string; cabNumber: string; date: string; amount: number; note: string; }
interface Broker {
  id: string; name: string; phone: string; billingDay: number; standRentAmount: number;
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

function txBadgeVariant(tx: Transaction): 'paid' | 'pending' | 'overdue' | 'void' {
  if (tx.status === 'VOID')    return 'void';
  if (tx.status === 'PAID')    return 'paid';
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

const EMPTY_BROKER = { name: '', phone: '', billingDay: '1', standRentAmount: '200', startDate: '' };


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
  const [txError,       setTxError]      = useState('');
  const [brokerError,   setBrokerError]  = useState('');
  const [filterMonth,   setFilterMonth]  = useState('');
  const [filterYear,    setFilterYear]   = useState('');

  const today = new Date();
  const thisMonth = today.getMonth() + 1;
  const thisYear  = today.getFullYear();

  // Summary card computations
  const totalExpenses = useMemo(() =>
    broker.expenses.reduce((s, e) => s + e.amount, 0),
  [broker.expenses]);

  const owedToUs = useMemo(() =>
    transactions.filter((t) => t.type !== 'PAYOUT' && t.status === 'PENDING').reduce((s, t) => s + t.amount, 0) + totalExpenses,
  [transactions, totalExpenses]);

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

  const weeksInMonth   = getWeeksInMonth(thisMonth, thisYear);
  const currentWeekNum = getCurrentWeekNum(thisMonth, thisYear, today);
  const billingDue     = today.getDate() >= broker.billingDay && thisMonthStandRentCount === 0;

  const [autoGenerating, setAutoGenerating] = useState(false);
  const [autoGenBanner,  setAutoGenBanner]  = useState('');
  const didAutoGen = useRef(false);

  useEffect(() => {
    if (didAutoGen.current || !broker.isActive) return;
    const existingCount = transactions.filter(
      (t) => t.type === 'STAND_RENT' && t.month === thisMonth && t.year === thisYear && t.status !== 'VOID'
    ).length;
    if (existingCount < currentWeekNum) {
      didAutoGen.current = true;
      autoGenerateWeeks(existingCount + 1, currentWeekNum);
    }
  // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  async function autoGenerateWeeks(fromWeek: number, toWeek: number) {
    setAutoGenerating(true);
    setAutoGenBanner(`Auto-generating Week${fromWeek === toWeek ? ` ${fromWeek}` : `s ${fromWeek}–${toWeek}`} stand rent…`);
    try {
      const allCreated: Transaction[] = [];
      const allEscalated: Transaction[] = [];

      for (let w = fromWeek; w <= toWeek; w++) {
        await fetch(`/api/brokers/${broker.id}/generate-week`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ month: thisMonth, year: thisYear, weekNumber: w }),
        });
      }

      // Refetch fresh transactions from server to avoid any stale-state merging
      const fresh = await fetch(`/api/brokers/${broker.id}`).then(r => r.json());
      if (fresh?.transactions) setTransactions(fresh.transactions);

      const label = fromWeek === toWeek ? `Week ${fromWeek}` : `Weeks ${fromWeek}–${toWeek}`;
      setAutoGenBanner(`✓ Auto-generated ${label} stand rent for ${MONTHS[thisMonth - 1]}`);
      setTimeout(() => setAutoGenBanner(''), 5000);
    } catch {
      setAutoGenBanner('');
    } finally {
      setAutoGenerating(false);
    }
  }

  // --- Broker edit ---
  function openEditBroker() {
    setBrokerForm({
      name:            broker.name,
      phone:           broker.phone,
      billingDay:      String(broker.billingDay),
      standRentAmount: String(broker.standRentAmount ?? 200),
      startDate:       broker.startDate ? broker.startDate.split('T')[0] : '',
    });
    setBrokerError(''); setShowEdit(true);
  }

  async function saveBroker() {
    setSavingBroker(true); setBrokerError('');
    try {
      const payload = {
        name:            brokerForm.name.trim() || broker.name,
        phone:           brokerForm.phone.trim(),
        startDate:       brokerForm.startDate || undefined,
        billingDay:      parseInt(brokerForm.billingDay) || 1,
        standRentAmount: parseFloat(brokerForm.standRentAmount) || 200,
      };
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

  async function voidTx(txId: string) {
    if (!confirm('Void this transaction? It will remain visible but excluded from all totals.')) return;
    const res = await fetch(`/api/brokers/transactions/${txId}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ status: 'VOID' }),
    });
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

  const txField = (key: keyof typeof EMPTY_TX) => ({
    value: txForm[key],
    onChange: (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => {
      const val = e.target.value;
      setTxForm((f) => {
        const updated = { ...f, [key]: val };
        // Auto-fill amount when switching to STAND_RENT
        if (key === 'type' && val === 'STAND_RENT') {
          const vehicleCount = broker.vehicles.filter((v) => v.isActive).length || 1;
          updated.amount = String(broker.standRentAmount * vehicleCount);
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
              <span>💵 Stand rent: ${broker.standRentAmount}/cab/week</span>
            </div>
          </div>
          <div className="flex items-center gap-2">
            {autoGenerating && (
              <span className="text-xs text-amber-600 font-medium animate-pulse">⚡ Auto-generating…</span>
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

      {/* Expenses quick link */}
      <div className="rounded-2xl bg-white shadow-sm ring-1 ring-gray-200 px-6 py-4">
        <div className="flex items-center justify-between">
          <div>
            <p className="text-xs font-bold uppercase tracking-widest text-gray-400">Expenses</p>
            <p className="mt-0.5 text-sm text-gray-500">Receipts, product charges, and other broker expenses.</p>
          </div>
          <Link
            href={`/expenses?broker=${broker.id}`}
            className="inline-flex items-center gap-1.5 rounded-lg bg-indigo-50 px-3 py-2 text-sm font-medium text-indigo-700 hover:bg-indigo-100 transition-colors"
          >
            <svg className="w-4 h-4" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.8}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M9 14l6-6m-5.5.5h.01m4.99 5h.01M19 21V5a2 2 0 00-2-2H7a2 2 0 00-2 2v16l3.5-2 3.5 2 3.5-2 3.5 2z" />
            </svg>
            View / Add Expenses →
          </Link>
        </div>
      </div>

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Owed To Us',           value: owedToUs,           color: 'text-indigo-600', sub: totalExpenses > 0 ? `incl. ${formatCurrency(totalExpenses)} expenses` : undefined },
          { label: 'We Owe Them',           value: weOweThem,          color: 'text-amber-600'  },
          { label: `Collected (${MONTHS[thisMonth - 1]})`, value: collectedThisMonth, color: 'text-emerald-600'},
          { label: `Paid Out (${MONTHS[thisMonth - 1]})`,  value: paidOutThisMonth,   color: 'text-rose-600'   },
        ].map((c) => (
          <div key={c.label} className="rounded-2xl bg-white px-5 py-4 shadow-sm ring-1 ring-gray-200">
            <p className="text-xs font-semibold uppercase tracking-widest text-gray-400">{c.label}</p>
            <p className={`mt-1.5 text-2xl font-bold ${c.color}`}>{formatCurrency(c.value)}</p>
            {'sub' in c && c.sub && <p className="mt-0.5 text-xs text-gray-400">{c.sub}</p>}
          </div>
        ))}
      </div>

      {/* Auto-gen banner */}
      {autoGenBanner && (
        <div className={`rounded-xl px-4 py-2.5 text-sm font-medium flex items-center gap-2 ${
          autoGenBanner.startsWith('✓')
            ? 'bg-emerald-50 text-emerald-700 ring-1 ring-emerald-200'
            : 'bg-amber-50 text-amber-700 ring-1 ring-amber-200'
        }`}>
          {autoGenBanner}
        </div>
      )}

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
                  const isVoid = tx.status === 'VOID';
                  return (
                    <tr key={tx.id} className={`group hover:bg-gray-50 transition-colors ${isVoid ? 'opacity-50' : ''}`}>
                      <td className="px-4 py-3.5 text-sm text-gray-500 whitespace-nowrap">
                        {format(new Date(tx.createdAt), 'MMM d, yyyy')}
                      </td>
                      <td className="px-4 py-3.5">
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700 whitespace-nowrap">
                          {TYPE_LABELS[tx.type] ?? tx.type}
                        </span>
                      </td>
                      <td className={`px-4 py-3.5 text-sm text-gray-600 max-w-[180px] truncate ${isVoid ? 'line-through' : ''}`}>{tx.description || '—'}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">{MONTHS[tx.month - 1]} {tx.year}</td>
                      <td className={`px-4 py-3.5 text-sm font-semibold ${isVoid ? 'text-gray-400 line-through' : 'text-gray-900'}`}>{formatCurrency(tx.amount)}</td>
                      <td className="px-4 py-3.5 text-sm text-gray-500">
                        {tx.dueDate ? format(new Date(tx.dueDate), 'MMM d, yyyy') : '—'}
                      </td>
                      <td className="px-4 py-3.5"><Badge variant={bv} /></td>
                      <td className="px-4 py-3.5">
                        <div className="flex items-center gap-1">
                          {!isVoid && (
                            <Button size="sm" variant="ghost" onClick={() => openEditTx(tx)}
                              className="opacity-0 group-hover:opacity-100">Edit</Button>
                          )}
                          {!isVoid && tx.status !== 'PAID' && (
                            <Button size="sm" variant="ghost" onClick={() => markPaid(tx.id)}
                              className="text-emerald-600 hover:bg-emerald-50">Mark Paid</Button>
                          )}
                          {!isVoid && tx.status === 'PAID' && (
                            <Button size="sm" variant="ghost" onClick={() => markUnpaid(tx.id)}
                              className="opacity-0 group-hover:opacity-100 text-amber-600 hover:bg-amber-50">Undo Paid</Button>
                          )}
                          {!isVoid && (
                            <Button size="sm" variant="ghost" onClick={() => voidTx(tx.id)}
                              className="opacity-0 group-hover:opacity-100 text-gray-400 hover:text-gray-600 hover:bg-gray-100">Void</Button>
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

          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowAddTx(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveTx} disabled={savingTx}>
              {savingTx ? 'Saving…' : 'Add Transaction'}
            </Button>
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
            <div className="col-span-2">
              <label className="block text-sm font-medium text-gray-700 mb-1">Broker Name</label>
              <input
                type="text"
                value={brokerForm.name}
                onChange={(e) => setBrokerForm((f) => ({ ...f, name: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Phone</label>
              <input
                type="text"
                value={brokerForm.phone}
                onChange={(e) => setBrokerForm((f) => ({ ...f, phone: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Start Date</label>
              <input
                type="date"
                value={brokerForm.startDate}
                onChange={(e) => setBrokerForm((f) => ({ ...f, startDate: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>

          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Weekly Stand Rent <span className="text-xs font-normal text-gray-400">($/vehicle/week)</span>
              </label>
              <input
                type="number" min={0} step={1}
                value={brokerForm.standRentAmount}
                onChange={(e) => setBrokerForm((f) => ({ ...f, standRentAmount: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              <p className="mt-1 text-xs text-gray-400">Late fee: +$30/vehicle per unpaid week</p>
            </div>
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Monthly Billing Day <span className="text-xs font-normal text-gray-400">(1–31)</span>
              </label>
              <input
                type="number" min={1} max={31}
                value={brokerForm.billingDay}
                onChange={(e) => setBrokerForm((f) => ({ ...f, billingDay: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
              {brokerForm.billingDay && (
                <p className="mt-1 text-xs text-gray-400">
                  Due on the {ordinal(parseInt(brokerForm.billingDay) || 1)} of each month.
                </p>
              )}
            </div>
          </div>

          {brokerError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{brokerError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowEdit(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveBroker} disabled={savingBroker}>
              {savingBroker ? 'Saving…' : 'Save Changes'}
            </Button>
          </div>
        </div>
      </Modal>

    </>
  );
}
