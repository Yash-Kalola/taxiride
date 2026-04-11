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

interface Broker {
  id: string; name: string; phone: string; vehiclePlate: string;
  startDate: string; endDate: string | null; isActive: boolean;
  transactions: Transaction[];
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

const EMPTY_BROKER = { name: '', phone: '', vehiclePlate: '', startDate: '' };

export default function BrokerDetailClient({ broker: initial }: { broker: Broker }) {
  const router = useRouter();
  const [broker,        setBroker]       = useState<Broker>(initial);
  const [transactions,  setTransactions] = useState<Transaction[]>(initial.transactions);
  const [showAddTx,     setShowAddTx]    = useState(false);
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

  // --- Broker edit ---
  function openEditBroker() {
    setBrokerForm({
      name:         broker.name,
      phone:        broker.phone,
      vehiclePlate: broker.vehiclePlate,
      startDate:    broker.startDate ? broker.startDate.split('T')[0] : '',
    });
    setBrokerError(''); setShowEdit(true);
  }

  async function saveBroker() {
    setSavingBroker(true); setBrokerError('');
    try {
      const res  = await fetch(`/api/brokers/${broker.id}`, { method: 'PUT', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(brokerForm) });
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
      const newTxs: Transaction[] = [];
      for (let week = 1; week <= 4; week++) {
        const res = await fetch(`/api/brokers/${broker.id}/transactions`, {
          method: 'POST', headers: { 'Content-Type': 'application/json' },
          body: JSON.stringify({ type: 'STAND_RENT', amount: 200, description: `Week ${week}`, month, year }),
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
        // Auto-fill $200 when switching to STAND_RENT
        if (key === 'type' && val === 'STAND_RENT') updated.amount = '200';
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
              <Badge variant={broker.isActive ? 'paid' : 'draft'} />
            </div>
            <div className="flex flex-wrap gap-x-6 gap-y-1 text-sm text-gray-500">
              {broker.phone       && <span>📞 {broker.phone}</span>}
              {broker.vehiclePlate && <span>🚗 Plate: <span className="font-mono font-medium text-gray-700">{broker.vehiclePlate}</span></span>}
              <span>Started: {broker.startDate ? format(new Date(broker.startDate), 'MMM d, yyyy') : '—'}</span>
              {broker.endDate && <span>Ended: {format(new Date(broker.endDate), 'MMM d, yyyy')}</span>}
            </div>
          </div>
          <div className="flex items-center gap-2">
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

      {/* Summary cards */}
      <div className="grid grid-cols-4 gap-4">
        {[
          { label: 'Owed To Us',           value: owedToUs,           color: 'text-indigo-600' },
          { label: 'We Owe Them',           value: weOweThem,          color: 'text-amber-600'  },
          { label: 'Collected This Month',  value: collectedThisMonth, color: 'text-emerald-600'},
          { label: 'Paid Out This Month',   value: paidOutThisMonth,   color: 'text-rose-600'   },
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
                        <span className="text-xs font-medium px-2 py-1 rounded-full bg-gray-100 text-gray-700">
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
                          {tx.status !== 'PAID' && (
                            <Button size="sm" variant="ghost" onClick={() => markPaid(tx.id)}
                              className="text-emerald-600 hover:bg-emerald-50">Mark Paid</Button>
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

      {/* Edit Broker Modal */}
      <Modal open={showEditBroker} onClose={() => setShowEdit(false)} title="Edit Broker">
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <Input label="Name" placeholder="John Smith" {...brokerField('name')} />
            <Input label="Phone" placeholder="+1 (705) 555-0123" {...brokerField('phone')} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Vehicle Plate" placeholder="ABCD 123" {...brokerField('vehiclePlate')} />
            <Input label="Start Date" type="date" {...brokerField('startDate')} />
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
    </>
  );
}
