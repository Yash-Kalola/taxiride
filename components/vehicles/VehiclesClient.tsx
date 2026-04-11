'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';

interface VehicleBroker { id: string; name: string; }
interface Vehicle {
  id: string; cabNumber: string; brokerId: string | null; isCompanyCar: boolean;
  insuranceAmount: number; isActive: boolean; createdAt: string;
  broker: VehicleBroker | null;
}
interface Broker { id: string; name: string; }

type Filter = 'all' | 'broker' | 'company';
type ModalMode = 'add' | 'edit' | null;

const EMPTY_FORM = { cabNumber: '', brokerId: '', isCompanyCar: false, insuranceAmount: '0' };

export default function VehiclesClient({ initialVehicles, brokers }: { initialVehicles: Vehicle[]; brokers: Broker[] }) {
  const [vehicles, setVehicles] = useState<Vehicle[]>(initialVehicles);
  const [modal,    setModal]    = useState<ModalMode>(null);
  const [editing,  setEditing]  = useState<Vehicle | null>(null);
  const [form,     setForm]     = useState(EMPTY_FORM);
  const [saving,   setSaving]   = useState(false);
  const [error,    setError]    = useState('');
  const [filter,   setFilter]   = useState<Filter>('all');

  const filtered = useMemo(() => {
    if (filter === 'broker')  return vehicles.filter((v) => !v.isCompanyCar);
    if (filter === 'company') return vehicles.filter((v) => v.isCompanyCar);
    return vehicles;
  }, [vehicles, filter]);

  function openAdd() {
    setForm(EMPTY_FORM); setEditing(null); setError(''); setModal('add');
  }

  function openEdit(v: Vehicle) {
    setForm({
      cabNumber:       v.cabNumber,
      brokerId:        v.brokerId ?? '',
      isCompanyCar:    v.isCompanyCar,
      insuranceAmount: String(v.insuranceAmount),
    });
    setEditing(v); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      const payload = {
        cabNumber:       form.cabNumber,
        brokerId:        form.brokerId || null,
        isCompanyCar:    form.isCompanyCar,
        insuranceAmount: parseFloat(form.insuranceAmount) || 0,
      };
      const url    = modal === 'edit' ? `/api/vehicles/${editing!.id}` : '/api/vehicles';
      const method = modal === 'edit' ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!res.ok) { setError(data.error ?? 'Failed'); return; }
      if (modal === 'edit') {
        setVehicles((prev) => prev.map((v) => v.id === editing!.id ? data : v));
      } else {
        setVehicles((prev) => [...prev, data].sort((a, b) => a.cabNumber.localeCompare(b.cabNumber)));
      }
      setModal(null);
    } catch { setError('Network error'); }
    finally { setSaving(false); }
  }

  async function toggleActive(v: Vehicle) {
    const res = await fetch(`/api/vehicles/${v.id}`, {
      method: 'PUT', headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ isActive: !v.isActive }),
    });
    if (res.ok) {
      const updated = await res.json();
      setVehicles((prev) => prev.map((x) => x.id === v.id ? updated : x));
    }
  }

  async function deleteVehicle(v: Vehicle) {
    if (!confirm(`Delete Cab #${v.cabNumber}? This cannot be undone.`)) return;
    const res = await fetch(`/api/vehicles/${v.id}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setVehicles((prev) => prev.filter((x) => x.id !== v.id));
    }
  }

  const filterLabels: { key: Filter; label: string }[] = [
    { key: 'all',     label: 'All' },
    { key: 'broker',  label: 'Broker Cars' },
    { key: 'company', label: 'Company Cars' },
  ];

  return (
    <>
      <PageHeader
        title="Vehicles"
        description={`${filtered.length} vehicle${filtered.length !== 1 ? 's' : ''}`}
        action={<Button variant="primary" onClick={openAdd}>+ Add Vehicle</Button>}
      />

      {/* Filter toggle */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {filterLabels.map(({ key, label }) => (
          <button
            key={key}
            onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}
          >
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <div className="mb-4 flex h-14 w-14 items-center justify-center rounded-2xl bg-indigo-50">
            <svg className="h-7 w-7 text-indigo-400" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
              <path strokeLinecap="round" strokeLinejoin="round" d="M8.25 18.75a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h6m-9 0H3.375a1.125 1.125 0 01-1.125-1.125V14.25m17.25 4.5a1.5 1.5 0 01-3 0m3 0a1.5 1.5 0 00-3 0m3 0h1.125c.621 0 1.129-.504 1.09-1.124a17.902 17.902 0 00-3.213-9.193 2.056 2.056 0 00-1.58-.86H14.25M16.5 18.75h-2.25m0-11.177v-.958c0-.568-.422-1.048-.987-1.106a48.554 48.554 0 00-10.026 0 1.106 1.106 0 00-.987 1.106v7.635m12-6.677v6.677m0 4.5v-4.5m0 0h-12" />
            </svg>
          </div>
          <p className="text-base font-semibold text-gray-900">No vehicles found</p>
          <p className="mt-1 text-sm text-gray-500">
            {filter !== 'all' ? 'Try switching the filter above.' : 'Add your first vehicle to get started.'}
          </p>
          {filter === 'all' && <Button variant="primary" className="mt-5" onClick={openAdd}>+ Add Vehicle</Button>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Cab #', 'Type', 'Assigned Broker', 'Insurance / mo', 'Status', ''].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((v) => (
                  <tr key={v.id} className="group hover:bg-gray-50 transition-colors">
                    <td className="px-5 py-4 font-mono text-sm font-bold text-gray-900">#{v.cabNumber}</td>
                    <td className="px-5 py-4">
                      <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                        v.isCompanyCar
                          ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20'
                          : 'bg-gray-100 text-gray-600 ring-1 ring-gray-400/20'
                      }`}>
                        {v.isCompanyCar ? 'Company Car' : "Broker's Car"}
                      </span>
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      {v.broker
                        ? <Link href={`/brokers/${v.broker.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">{v.broker.name}</Link>
                        : <span className="text-gray-400">— Unassigned —</span>
                      }
                    </td>
                    <td className="px-5 py-4 text-sm text-gray-700">
                      {v.isCompanyCar && v.insuranceAmount > 0 ? formatCurrency(v.insuranceAmount) : <span className="text-gray-400">—</span>}
                    </td>
                    <td className="px-5 py-4">
                      <Badge variant={v.isActive ? 'active' : 'inactive'} />
                    </td>
                    <td className="px-5 py-4">
                      <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                        <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>Edit</Button>
                        <Button size="sm" variant="ghost" onClick={() => toggleActive(v)}
                          className={v.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}>
                          {v.isActive ? 'Deactivate' : 'Activate'}
                        </Button>
                        <Button size="sm" variant="ghost" onClick={() => deleteVehicle(v)}
                          className="text-red-500 hover:text-red-700 hover:bg-red-50">Delete</Button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Vehicle' : 'Add Vehicle'}>
        <div className="space-y-4">
          <Input
            label="Cab Number"
            placeholder="e.g. 11"
            value={form.cabNumber}
            onChange={(e) => setForm((f) => ({ ...f, cabNumber: e.target.value }))}
          />

          {/* Type selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Vehicle Type</label>
            <div className="flex gap-3">
              {[
                { value: false, label: "Broker's Car",  desc: 'Owned by the broker' },
                { value: true,  label: 'Company Car',   desc: 'Company-owned, subleased to broker' },
              ].map((opt) => (
                <button
                  key={String(opt.value)}
                  type="button"
                  onClick={() => setForm((f) => ({ ...f, isCompanyCar: opt.value }))}
                  className={`flex-1 rounded-xl border-2 p-3 text-left transition-colors ${
                    form.isCompanyCar === opt.value
                      ? 'border-indigo-500 bg-indigo-50'
                      : 'border-gray-200 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-semibold text-gray-900">{opt.label}</p>
                  <p className="text-xs text-gray-500 mt-0.5">{opt.desc}</p>
                </button>
              ))}
            </div>
          </div>

          <Select
            label="Assigned To (Broker)"
            value={form.brokerId}
            onChange={(e) => setForm((f) => ({ ...f, brokerId: e.target.value }))}
          >
            <option value="">— Unassigned —</option>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>

          {form.isCompanyCar && (
            <Input
              label="Insurance Amount ($/month)"
              type="number"
              min={0}
              step={0.01}
              placeholder="0.00"
              value={form.insuranceAmount}
              onChange={(e) => setForm((f) => ({ ...f, insuranceAmount: e.target.value }))}
            />
          )}

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || !form.cabNumber}>
              {saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Add Vehicle'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
