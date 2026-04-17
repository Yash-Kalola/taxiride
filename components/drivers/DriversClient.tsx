'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';

interface Assignment {
  id: string; vehicleNumber: string; shift: 'MORNING' | 'EVENING';
  startDate: string; endDate: string | null; isActive: boolean;
}
interface Driver {
  id: string; name: string; phone: string; licenseNumber: string;
  isActive: boolean; startDate: string; endDate: string | null;
  assignments: Assignment[];
}

type Filter = 'active' | 'inactive' | 'all';
type ModalMode = 'add' | 'edit' | null;

const EMPTY_FORM = {
  name: '', phone: '', licenseNumber: '',
  startDate:     new Date().toISOString().split('T')[0],
  vehicleNumber: '',
  shift:         'MORNING' as 'MORNING' | 'EVENING',
};

export default function DriversClient({ initialDrivers }: { initialDrivers: Driver[] }) {
  const [drivers,     setDrivers]     = useState<Driver[]>(initialDrivers);
  const [modal,       setModal]       = useState<ModalMode>(null);
  const [editing,     setEditing]     = useState<Driver | null>(null);
  const [form,        setForm]        = useState(EMPTY_FORM);
  const [saving,      setSaving]      = useState(false);
  const [error,       setError]       = useState('');
  const [filter,      setFilter]      = useState<Filter>('active');

  const filtered = useMemo(() => {
    if (filter === 'active')   return drivers.filter((d) => d.isActive);
    if (filter === 'inactive') return drivers.filter((d) => !d.isActive);
    return drivers;
  }, [drivers, filter]);

  function openAdd() { setForm(EMPTY_FORM); setEditing(null); setError(''); setModal('add'); }
  function openEdit(d: Driver) {
    const cur = d.assignments[0];
    setForm({
      name:          d.name,
      phone:         d.phone,
      licenseNumber: d.licenseNumber,
      startDate:     d.startDate ? d.startDate.split('T')[0] : '',
      vehicleNumber: cur?.vehicleNumber ?? '',
      shift:         cur?.shift ?? 'MORNING',
    });
    setEditing(d); setError(''); setModal('edit');
  }

  async function save() {
    setSaving(true); setError('');
    try {
      // Step 1: create or update the driver
      const driverPayload: any = {
        name:          form.name,
        phone:         form.phone,
        licenseNumber: form.licenseNumber,
      };
      if (form.startDate) driverPayload.startDate = form.startDate;
      const url    = modal === 'edit' ? `/api/drivers/${editing!.id}` : '/api/drivers';
      const method = modal === 'edit' ? 'PUT' : 'POST';
      const res    = await fetch(url, {
        method, headers: { 'Content-Type': 'application/json' },
        body:   JSON.stringify(driverPayload),
      });
      const data   = await res.json();
      if (!res.ok) { setError(typeof data.error === 'string' ? data.error : 'Failed to save'); return; }

      // Step 2: create or replace the vehicle assignment if vehicle# is provided
      //   - on add: always create a new assignment
      //   - on edit: create only if vehicle# or shift actually changed from the current one
      const driverId = modal === 'edit' ? editing!.id : data.id;
      if (form.vehicleNumber.trim() && driverId) {
        const current = modal === 'edit' ? editing!.assignments[0] : null;
        const changed =
          !current ||
          current.vehicleNumber !== form.vehicleNumber.trim() ||
          current.shift !== form.shift;
        if (changed) {
          const assignRes = await fetch(`/api/drivers/${driverId}/assignments`, {
            method:  'POST',
            headers: { 'Content-Type': 'application/json' },
            body:    JSON.stringify({
              vehicleNumber: form.vehicleNumber.trim(),
              shift:         form.shift,
              startDate:     form.startDate || new Date().toISOString().split('T')[0],
            }),
          });
          if (!assignRes.ok) {
            const assignData = await assignRes.json().catch(() => ({}));
            setError(typeof assignData.error === 'string'
              ? `Driver saved, but vehicle assignment failed: ${assignData.error}`
              : 'Driver saved, but vehicle assignment failed.');
            const fresh = await fetch('/api/drivers').then((r) => r.json());
            setDrivers(fresh);
            return;
          }
        }
      }

      // Refresh the list so the new vehicle/shift columns reflect immediately
      const fresh = await fetch('/api/drivers').then((r) => r.json());
      setDrivers(fresh);
      setModal(null);
    } catch {
      setError('Network error');
    } finally {
      setSaving(false);
    }
  }

  async function toggleActive(d: Driver) {
    const verb = d.isActive ? 'Deactivate' : 'Reactivate';
    if (d.isActive && !confirm(`${verb} ${d.name}? Their current vehicle assignment will be ended.`)) return;
    try {
      const res = await fetch(`/api/drivers/${d.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !d.isActive }),
      });
      if (!res.ok) { alert(`Failed to ${verb.toLowerCase()} driver.`); return; }
      const fresh = await fetch('/api/drivers').then((r) => r.json());
      setDrivers(fresh);
    } catch { alert('Network error'); }
  }

  const filterLabels: { key: Filter; label: string }[] = [
    { key: 'active',   label: 'Active' },
    { key: 'inactive', label: 'Inactive' },
    { key: 'all',      label: 'All' },
  ];

  return (
    <>
      <PageHeader
        title="Drivers"
        description={`${filtered.length} driver${filtered.length !== 1 ? 's' : ''}`}
        action={<Button variant="primary" onClick={openAdd}>+ Add Driver</Button>}
      />

      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        {filterLabels.map(({ key, label }) => (
          <button key={key} onClick={() => setFilter(key)}
            className={`rounded-md px-3 py-1.5 text-sm font-medium transition-colors ${
              filter === key ? 'bg-white text-gray-900 shadow-sm' : 'text-gray-500 hover:text-gray-700'
            }`}>
            {label}
          </button>
        ))}
      </div>

      {filtered.length === 0 ? (
        <div className="flex flex-col items-center justify-center rounded-2xl border-2 border-dashed border-gray-200 bg-white py-20 text-center">
          <p className="text-base font-semibold text-gray-900">No drivers found</p>
          <p className="mt-1 text-sm text-gray-500">{filter !== 'all' ? 'Try switching the filter.' : 'Add your first driver to get started.'}</p>
          {filter === 'all' && <Button variant="primary" className="mt-5" onClick={openAdd}>+ Add Driver</Button>}
        </div>
      ) : (
        <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
          <div className="overflow-x-auto">
            <table className="w-full">
              <thead>
                <tr className="border-b border-gray-100 bg-gray-50">
                  {['Name', 'Phone', 'Status', ''].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((d) => (
                    <tr key={d.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4">
                        <Link href={`/drivers/${d.id}`} className="font-semibold text-indigo-600 hover:text-indigo-800">{d.name}</Link>
                        {d.licenseNumber && <p className="text-xs text-gray-400 font-mono mt-0.5">Lic: {d.licenseNumber}</p>}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600">{d.phone || <span className="text-gray-300">—</span>}</td>
                      <td className="px-5 py-4">
                        <Badge variant={d.isActive ? 'active' : 'inactive'} />
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(d)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(d)}
                            className={d.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}>
                            {d.isActive ? 'Deactivate' : 'Reactivate'}
                          </Button>
                        </div>
                      </td>
                    </tr>
                  ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add / Edit Driver Modal */}
      <Modal open={modal !== null} onClose={() => setModal(null)} title={modal === 'edit' ? 'Edit Driver' : 'Add Driver'}>
        <div className="space-y-4">
          <Input label="Name" placeholder="Driver name"
            value={form.name} onChange={(e) => setForm((f) => ({ ...f, name: e.target.value }))}
          />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Phone" placeholder="+1 (705) 555-0123"
              value={form.phone} onChange={(e) => setForm((f) => ({ ...f, phone: e.target.value }))}
            />
            <Input label="License #" placeholder="Optional"
              value={form.licenseNumber} onChange={(e) => setForm((f) => ({ ...f, licenseNumber: e.target.value }))}
            />
          </div>
          <Input label="Start Date" type="date"
            value={form.startDate} onChange={(e) => setForm((f) => ({ ...f, startDate: e.target.value }))}
          />

          {/* Vehicle assignment — optional. If provided, creates/replaces the driver's current assignment. */}
          <div className="pt-3 mt-2 border-t border-gray-100">
            <p className="text-xs font-semibold uppercase tracking-wide text-gray-400 mb-3">
              Vehicle Assignment <span className="font-normal normal-case tracking-normal text-gray-400">(optional)</span>
            </p>
            <div className="grid grid-cols-2 gap-4">
              <Input label="Cab Number" placeholder="e.g. 30"
                value={form.vehicleNumber}
                onChange={(e) => setForm((f) => ({ ...f, vehicleNumber: e.target.value }))}
              />
              <Select label="Shift"
                value={form.shift}
                onChange={(e) => setForm((f) => ({ ...f, shift: e.target.value as any }))}
              >
                <option value="MORNING">Morning (5am – 5pm)</option>
                <option value="EVENING">Evening (5pm – 5am)</option>
              </Select>
            </div>
            {modal === 'edit' && editing?.assignments[0] && (
              <p className="mt-2 text-xs text-gray-500">
                Current: #{editing.assignments[0].vehicleNumber} · {editing.assignments[0].shift === 'MORNING' ? 'Morning' : 'Evening'}.
                Changing this ends the old assignment and starts a new one.
              </p>
            )}
          </div>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || !form.name || !form.startDate}>
              {saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Add Driver'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}
