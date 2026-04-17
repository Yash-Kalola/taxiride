'use client';
import { useState, useMemo } from 'react';
import Link from 'next/link';
import { format } from 'date-fns';
import Button from '@/components/ui/Button';
import Badge from '@/components/ui/Badge';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { formatCurrency } from '@/lib/tax';

interface VehicleBroker { id: string; name: string; }
interface Accident {
  id: string; vehicleId: string; date: string; incidentNumber: string;
  claimNumber: string; driver: string; settlementAmount: number | null; notes: string; createdAt: string;
}
interface VehicleDoc {
  id: string; vehicleId: string; label: string; fileName: string;
  filePath: string; fileType: string; fileSize: number; createdAt: string;
}
interface Vehicle {
  id: string; cabNumber: string; brokerId: string | null; isCompanyCar: boolean;
  insuranceAmount: number; isActive: boolean; createdAt: string;
  broker: VehicleBroker | null;
  accidents: Accident[];
  documents: VehicleDoc[];
}
interface Broker { id: string; name: string; }
interface Driver { id: string; name: string; }
interface DriverRef { assignmentId: string; driverId: string; driverName: string; }
interface AssignmentRow { cabNumber: string; morning: DriverRef | null; evening: DriverRef | null; }

type Filter = 'all' | 'broker' | 'company';
type ModalMode = 'add' | 'edit' | null;

const EMPTY_FORM      = { cabNumber: '', brokerId: '', isCompanyCar: false, insuranceAmount: '0' };
const EMPTY_ACCIDENT  = { date: new Date().toISOString().split('T')[0], incidentNumber: '', claimNumber: '', driver: '', settlementAmount: '', notes: '' };

export default function VehiclesClient({
  initialVehicles, brokers, drivers, initialAssignments,
}: {
  initialVehicles: Vehicle[]; brokers: Broker[]; drivers: Driver[]; initialAssignments: AssignmentRow[];
}) {
  const [vehicles,       setVehicles]      = useState<Vehicle[]>(initialVehicles);
  const [assignments,    setAssignments]   = useState<AssignmentRow[]>(initialAssignments);
  const [modal,          setModal]         = useState<ModalMode>(null);
  const [editing,        setEditing]       = useState<Vehicle | null>(null);
  const [form,           setForm]          = useState(EMPTY_FORM);
  const [saving,         setSaving]        = useState(false);
  const [error,          setError]         = useState('');
  const [filter,         setFilter]        = useState<Filter>('all');
  // Driver assignment modal
  const [assignVehicle,  setAssignVehicle] = useState<Vehicle | null>(null);
  const [assignShift,    setAssignShift]   = useState<'MORNING' | 'EVENING'>('MORNING');
  const [assignDriverId, setAssignDriverId] = useState<string>('');
  const [assignSaving,   setAssignSaving]  = useState(false);
  const [assignError,    setAssignError]   = useState('');

  const assignmentByCab = useMemo(() => {
    const m = new Map<string, AssignmentRow>();
    for (const a of assignments) m.set(a.cabNumber, a);
    return m;
  }, [assignments]);
  // Accident tracking
  const [accidentVehicle,  setAccidentVehicle]  = useState<Vehicle | null>(null);
  const [accidentModal,    setAccidentModal]    = useState<'add' | 'edit' | null>(null);
  const [editingAccident,  setEditingAccident]  = useState<Accident | null>(null);
  const [accidentForm,     setAccidentForm]     = useState(EMPTY_ACCIDENT);
  const [savingAccident,   setSavingAccident]   = useState(false);
  const [accidentError,    setAccidentError]    = useState('');
  const [expandedAccidents, setExpandedAccidents] = useState<Set<string>>(new Set());
  // Document uploads
  const [expandedDocs,    setExpandedDocs]    = useState<Set<string>>(new Set());
  const [docVehicle,      setDocVehicle]      = useState<Vehicle | null>(null);
  const [showDocModal,    setShowDocModal]    = useState(false);
  const [docLabel,        setDocLabel]        = useState('');
  const [docFile,         setDocFile]         = useState<File | null>(null);
  const [savingDoc,       setSavingDoc]       = useState(false);
  const [docError,        setDocError]        = useState('');

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
    try {
      const res = await fetch(`/api/vehicles/${v.id}`, {
        method: 'PUT', headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ isActive: !v.isActive }),
      });
      if (res.ok) {
        const updated = await res.json();
        setVehicles((prev) => prev.map((x) => x.id === v.id ? updated : x));
      } else {
        alert('Failed to update vehicle — please try again.');
      }
    } catch {
      alert('Network error — please try again.');
    }
  }

  async function deleteVehicle(v: Vehicle) {
    if (!confirm(`Delete Cab #${v.cabNumber}? This cannot be undone.`)) return;
    try {
      const res = await fetch(`/api/vehicles/${v.id}`, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        setVehicles((prev) => prev.filter((x) => x.id !== v.id));
      } else {
        alert('Failed to delete vehicle — please try again.');
      }
    } catch {
      alert('Network error — please try again.');
    }
  }

  // --- Accident helpers ---
  function toggleAccidentExpand(vehicleId: string) {
    setExpandedAccidents(prev => {
      const next = new Set(prev);
      next.has(vehicleId) ? next.delete(vehicleId) : next.add(vehicleId);
      return next;
    });
  }

  function openAddAccident(v: Vehicle) {
    setAccidentVehicle(v); setAccidentForm(EMPTY_ACCIDENT);
    setEditingAccident(null); setAccidentError(''); setAccidentModal('add');
  }

  function openEditAccident(v: Vehicle, a: Accident) {
    setAccidentVehicle(v);
    setAccidentForm({
      date:             a.date ? a.date.split('T')[0] : '',
      incidentNumber:   a.incidentNumber,
      claimNumber:      a.claimNumber,
      driver:           a.driver,
      settlementAmount: a.settlementAmount != null ? String(a.settlementAmount) : '',
      notes:            a.notes,
    });
    setEditingAccident(a); setAccidentError(''); setAccidentModal('edit');
  }

  async function saveAccident() {
    if (!accidentVehicle) return;
    setSavingAccident(true); setAccidentError('');
    try {
      const payload = {
        ...accidentForm,
        settlementAmount: accidentForm.settlementAmount ? parseFloat(accidentForm.settlementAmount) : undefined,
      };
      const url    = accidentModal === 'edit' ? `/api/vehicles/accidents/${editingAccident!.id}` : `/api/vehicles/${accidentVehicle.id}/accidents`;
      const method = accidentModal === 'edit' ? 'PUT' : 'POST';
      const res    = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
      const data   = await res.json();
      if (!res.ok) { setAccidentError(data.error ?? 'Failed'); return; }
      setVehicles(prev => prev.map(v => {
        if (v.id !== accidentVehicle.id) return v;
        const accidents = accidentModal === 'edit'
          ? v.accidents.map(a => a.id === editingAccident!.id ? data : a)
          : [data, ...v.accidents];
        return { ...v, accidents };
      }));
      setAccidentModal(null);
    } catch { setAccidentError('Network error'); }
    finally { setSavingAccident(false); }
  }

  async function deleteAccident(v: Vehicle, accidentId: string) {
    if (!confirm('Delete this accident record?')) return;
    const res = await fetch(`/api/vehicles/accidents/${accidentId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setVehicles(prev => prev.map(x =>
        x.id === v.id ? { ...x, accidents: x.accidents.filter(a => a.id !== accidentId) } : x
      ));
    }
  }

  // --- Document helpers ---
  function toggleDocExpand(vehicleId: string) {
    setExpandedDocs(prev => {
      const next = new Set(prev);
      next.has(vehicleId) ? next.delete(vehicleId) : next.add(vehicleId);
      return next;
    });
  }

  function openAddDoc(v: Vehicle) {
    setDocVehicle(v); setDocLabel(''); setDocFile(null); setDocError(''); setShowDocModal(true);
  }

  async function saveDoc() {
    if (!docVehicle || !docFile) { setDocError('Please select a file.'); return; }
    setSavingDoc(true); setDocError('');
    try {
      const fd = new FormData();
      fd.append('file',  docFile);
      fd.append('label', docLabel);
      const res  = await fetch(`/api/vehicles/${docVehicle.id}/documents`, { method: 'POST', body: fd });
      const data = await res.json();
      if (!res.ok) { setDocError(data.error ?? 'Upload failed'); return; }
      setVehicles(prev => prev.map(v =>
        v.id === docVehicle.id ? { ...v, documents: [data, ...v.documents] } : v
      ));
      setShowDocModal(false);
    } catch { setDocError('Network error'); }
    finally { setSavingDoc(false); }
  }

  async function deleteDoc(v: Vehicle, docId: string) {
    if (!confirm('Delete this document?')) return;
    const res = await fetch(`/api/vehicles/documents/${docId}`, { method: 'DELETE' });
    if (res.ok || res.status === 204) {
      setVehicles(prev => prev.map(x =>
        x.id === v.id ? { ...x, documents: x.documents.filter(d => d.id !== docId) } : x
      ));
    }
  }

  // --- Driver assignment helpers ---
  function openAssign(v: Vehicle, shift: 'MORNING' | 'EVENING') {
    setAssignVehicle(v); setAssignShift(shift);
    // Pre-fill current driver if any
    const row = assignmentByCab.get(v.cabNumber);
    const current = shift === 'MORNING' ? row?.morning : row?.evening;
    setAssignDriverId(current?.driverId ?? '');
    setAssignError('');
  }

  async function refreshAssignments() {
    try {
      const res = await fetch('/api/vehicle-assignments/summary');
      if (!res.ok) return;
      const data = await res.json();
      // Keep only rows for known cabs we're showing
      const known = new Set(vehicles.map((v) => v.cabNumber));
      setAssignments((data.rows ?? []).filter((r: AssignmentRow) => known.has(r.cabNumber)));
    } catch {}
  }

  async function saveAssignment() {
    if (!assignVehicle) return;
    setAssignSaving(true); setAssignError('');
    try {
      const res = await fetch('/api/vehicle-assignments', {
        method:  'POST',
        headers: { 'Content-Type': 'application/json' },
        body:    JSON.stringify({
          vehicleNumber: assignVehicle.cabNumber,
          shift:         assignShift,
          driverId:      assignDriverId || null,
        }),
      });
      const data = await res.json();
      if (!res.ok) { setAssignError(typeof data.error === 'string' ? data.error : 'Failed to save'); return; }
      await refreshAssignments();
      setAssignVehicle(null);
    } catch { setAssignError('Network error'); }
    finally { setAssignSaving(false); }
  }

  function formatFileSize(bytes: number): string {
    if (bytes < 1024)       return `${bytes} B`;
    if (bytes < 1024 * 1024) return `${(bytes / 1024).toFixed(0)} KB`;
    return `${(bytes / (1024 * 1024)).toFixed(1)} MB`;
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
                  {['Cab #', 'Ownership', 'Assigned Broker', 'Status', ''].map((h) => (
                    <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-50">
                {filtered.map((v) => (
                  <>
                    <tr key={v.id} className="group hover:bg-gray-50 transition-colors">
                      <td className="px-5 py-4 font-mono text-sm font-bold text-gray-900">#{v.cabNumber}</td>
                      <td className="px-5 py-4">
                        <span className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ${
                          v.isCompanyCar
                            ? 'bg-indigo-50 text-indigo-700 ring-1 ring-indigo-600/20'
                            : 'bg-gray-100 text-gray-600 ring-1 ring-gray-400/20'
                        }`}>
                          {v.isCompanyCar ? 'Owned by Company' : 'Owned by Broker'}
                        </span>
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-700">
                        {v.broker
                          ? <Link href={`/brokers/${v.broker.id}`} className="font-medium text-indigo-600 hover:text-indigo-800">{v.broker.name}</Link>
                          : <span className="text-gray-400">— Unassigned —</span>
                        }
                      </td>
                      <td className="px-5 py-4">
                        <Badge variant={v.isActive ? 'active' : 'inactive'} />
                        {v.isCompanyCar && v.accidents.length > 0 && (
                          <button onClick={() => toggleAccidentExpand(v.id)}
                            className="mt-0.5 block text-xs text-red-500 hover:underline">
                            {v.accidents.length} accident{v.accidents.length !== 1 ? 's' : ''} {expandedAccidents.has(v.id) ? '▲' : '▼'}
                          </button>
                        )}
                        {v.documents.length > 0 && (
                          <button onClick={() => toggleDocExpand(v.id)}
                            className="mt-0.5 block text-xs text-indigo-500 hover:underline">
                            {v.documents.length} doc{v.documents.length !== 1 ? 's' : ''} {expandedDocs.has(v.id) ? '▲' : '▼'}
                          </button>
                        )}
                      </td>
                      <td className="px-5 py-4">
                        <div className="flex items-center gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="ghost" onClick={() => openEdit(v)}>Edit</Button>
                          {v.isCompanyCar && (
                            <Button size="sm" variant="ghost" onClick={() => { openAddAccident(v); setExpandedAccidents(p => new Set([...p, v.id])); }}
                              className="text-red-600 hover:bg-red-50">+ Accident</Button>
                          )}
                          <Button size="sm" variant="ghost" onClick={() => { openAddDoc(v); setExpandedDocs(p => new Set([...p, v.id])); }}
                            className="text-indigo-600 hover:bg-indigo-50">+ Doc</Button>
                          <Button size="sm" variant="ghost" onClick={() => toggleActive(v)}
                            className={v.isActive ? 'text-amber-600 hover:bg-amber-50' : 'text-emerald-600 hover:bg-emerald-50'}>
                            {v.isActive ? 'Deactivate' : 'Activate'}
                          </Button>
                          <Button size="sm" variant="ghost" onClick={() => deleteVehicle(v)}
                            className="text-red-500 hover:text-red-700 hover:bg-red-50">Delete</Button>
                        </div>
                      </td>
                    </tr>
                    {/* Documents sub-row (all vehicles) */}
                    {expandedDocs.has(v.id) && (
                      <tr key={`${v.id}-docs`}>
                        <td colSpan={5} className="bg-indigo-50 px-5 py-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-widest text-indigo-400">Documents — Cab #{v.cabNumber}</p>
                            <Button size="sm" variant="ghost" onClick={() => openAddDoc(v)}
                              className="text-indigo-600 hover:bg-indigo-100 text-xs">+ Upload Document</Button>
                          </div>
                          {v.documents.length === 0 ? (
                            <p className="text-sm text-gray-400">No documents uploaded yet.</p>
                          ) : (
                            <div className="space-y-1.5">
                              {v.documents.map(d => (
                                <div key={d.id} className="flex items-center justify-between rounded-lg bg-white border border-indigo-100 px-3 py-2">
                                  <div className="flex items-center gap-3 min-w-0">
                                    <svg className="w-5 h-5 text-indigo-400 shrink-0" fill="none" viewBox="0 0 24 24" stroke="currentColor" strokeWidth={1.5}>
                                      <path strokeLinecap="round" strokeLinejoin="round" d="M19.5 14.25v-2.625a3.375 3.375 0 00-3.375-3.375h-1.5A1.125 1.125 0 0113.5 7.125v-1.5a3.375 3.375 0 00-3.375-3.375H8.25m2.25 0H5.625c-.621 0-1.125.504-1.125 1.125v17.25c0 .621.504 1.125 1.125 1.125h12.75c.621 0 1.125-.504 1.125-1.125V11.25a9 9 0 00-9-9z" />
                                    </svg>
                                    <div className="min-w-0">
                                      {d.label && <p className="text-xs font-semibold text-gray-700">{d.label}</p>}
                                      <p className="text-xs text-gray-500 truncate">{d.fileName}</p>
                                      <p className="text-xs text-gray-400">{formatFileSize(d.fileSize)} · {format(new Date(d.createdAt), 'MMM d, yyyy')}</p>
                                    </div>
                                  </div>
                                  <div className="flex items-center gap-2 shrink-0 ml-4">
                                    <a href={d.filePath} target="_blank" rel="noopener noreferrer"
                                      className="text-xs text-indigo-600 hover:underline font-medium">Download</a>
                                    <Button size="sm" variant="ghost" onClick={() => deleteDoc(v, d.id)}
                                      className="text-xs text-red-500 hover:bg-red-50">Delete</Button>
                                  </div>
                                </div>
                              ))}
                            </div>
                          )}
                        </td>
                      </tr>
                    )}
                    {/* Accident sub-rows for company cars */}
                    {v.isCompanyCar && expandedAccidents.has(v.id) && (
                      <tr key={`${v.id}-accidents`}>
                        <td colSpan={5} className="bg-red-50 px-5 py-3">
                          <div className="mb-2 flex items-center justify-between">
                            <p className="text-xs font-bold uppercase tracking-widest text-red-400">Accident / Claim Records — Cab #{v.cabNumber}</p>
                            <Button size="sm" variant="ghost" onClick={() => openAddAccident(v)}
                              className="text-red-600 hover:bg-red-100 text-xs">+ Log Accident</Button>
                          </div>
                          {v.accidents.length === 0 ? (
                            <p className="text-sm text-gray-400">No accidents logged.</p>
                          ) : (
                            <table className="w-full text-sm">
                              <thead>
                                <tr className="text-left text-xs font-semibold text-red-300 uppercase tracking-wide">
                                  <th className="pb-1 pr-4">Date</th>
                                  <th className="pb-1 pr-4">Incident #</th>
                                  <th className="pb-1 pr-4">Claim #</th>
                                  <th className="pb-1 pr-4">Driver</th>
                                  <th className="pb-1 pr-4">Settlement</th>
                                  <th className="pb-1" />
                                </tr>
                              </thead>
                              <tbody className="divide-y divide-red-100">
                                {v.accidents.map(a => (
                                  <tr key={a.id} className="group/acc">
                                    <td className="py-1.5 pr-4 text-gray-600 whitespace-nowrap">{format(new Date(a.date), 'MMM d, yyyy')}</td>
                                    <td className="py-1.5 pr-4 font-mono text-gray-700">{a.incidentNumber || '—'}</td>
                                    <td className="py-1.5 pr-4 font-mono text-gray-500">{a.claimNumber || <span className="text-gray-300 italic">pending</span>}</td>
                                    <td className="py-1.5 pr-4 text-gray-600">{a.driver || '—'}</td>
                                    <td className="py-1.5 pr-4 font-semibold">
                                      {a.settlementAmount != null
                                        ? <span className="text-emerald-700">{formatCurrency(a.settlementAmount)}</span>
                                        : <span className="text-amber-500 text-xs">Pending</span>
                                      }
                                    </td>
                                    <td className="py-1.5">
                                      <div className="flex gap-1 opacity-0 group-hover/acc:opacity-100">
                                        <Button size="sm" variant="ghost" onClick={() => openEditAccident(v, a)}
                                          className="text-xs">Edit</Button>
                                        <Button size="sm" variant="ghost" onClick={() => deleteAccident(v, a.id)}
                                          className="text-xs text-red-500 hover:bg-red-100">Delete</Button>
                                      </div>
                                    </td>
                                  </tr>
                                ))}
                              </tbody>
                            </table>
                          )}
                        </td>
                      </tr>
                    )}
                  </>
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

          {/* Ownership selector */}
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Ownership</label>
            <div className="flex gap-3">
              {[
                { value: false, label: "Broker Car",  desc: 'Owned by Broker' },
                { value: true,  label: 'Company Car',   desc: 'Owned by Company' },
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
            <p className="mt-2 text-xs text-gray-400">
              {form.isCompanyCar
                ? 'Company car — use Recurring Payments to manage insurance charges.'
                : 'Broker car — broker is responsible for insurance.'}
            </p>
          </div>

          <Select
            label="Assigned To (Broker)"
            value={form.brokerId}
            onChange={(e) => setForm((f) => ({ ...f, brokerId: e.target.value }))}
          >
            <option value="">— Unassigned —</option>
            {brokers.map((b) => <option key={b.id} value={b.id}>{b.name}</option>)}
          </Select>

          {error && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{error}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={save} disabled={saving || !form.cabNumber}>
              {saving ? 'Saving…' : modal === 'edit' ? 'Save Changes' : 'Add Vehicle'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Log / Edit Accident Modal */}
      <Modal
        open={accidentModal !== null}
        onClose={() => setAccidentModal(null)}
        title={accidentModal === 'edit' ? `Edit Accident — Cab #${accidentVehicle?.cabNumber}` : `Log Accident — Cab #${accidentVehicle?.cabNumber}`}
      >
        <div className="space-y-4">
          <div className="grid grid-cols-2 gap-4">
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">Date</label>
              <input type="date" value={accidentForm.date}
                onChange={e => setAccidentForm(f => ({ ...f, date: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
            <Input label="Driver" placeholder="Driver name"
              value={accidentForm.driver}
              onChange={e => setAccidentForm(f => ({ ...f, driver: e.target.value }))}
            />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Incident #" placeholder="INC-2026-04"
              value={accidentForm.incidentNumber}
              onChange={e => setAccidentForm(f => ({ ...f, incidentNumber: e.target.value }))}
            />
            <div>
              <label className="block text-sm font-medium text-gray-700 mb-1">
                Claim #
                <span className="ml-1 text-xs font-normal text-gray-400">(optional — add later)</span>
              </label>
              <input type="text" value={accidentForm.claimNumber} placeholder="CLM-9921"
                onChange={e => setAccidentForm(f => ({ ...f, claimNumber: e.target.value }))}
                className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
              />
            </div>
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Settlement Amount ($)
              <span className="ml-1 text-xs font-normal text-gray-400">(leave blank until settled)</span>
            </label>
            <input type="number" min={0} step={0.01} value={accidentForm.settlementAmount} placeholder="0.00"
              onChange={e => setAccidentForm(f => ({ ...f, settlementAmount: e.target.value }))}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <input type="text" value={accidentForm.notes} placeholder="Optional notes…"
              onChange={e => setAccidentForm(f => ({ ...f, notes: e.target.value }))}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {accidentError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{accidentError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAccidentModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveAccident}
              disabled={savingAccident || !accidentForm.incidentNumber || !accidentForm.date}>
              {savingAccident ? 'Saving…' : accidentModal === 'edit' ? 'Save Changes' : 'Log Accident'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Assign Driver Modal */}
      <Modal
        open={assignVehicle !== null}
        onClose={() => setAssignVehicle(null)}
        title={`Assign ${assignShift === 'MORNING' ? 'Morning' : 'Evening'} Driver — Cab #${assignVehicle?.cabNumber}`}
      >
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-2">Shift</label>
            <div className="flex gap-2">
              {(['MORNING', 'EVENING'] as const).map((s) => (
                <button
                  key={s}
                  type="button"
                  onClick={() => {
                    setAssignShift(s);
                    if (assignVehicle) {
                      const row = assignmentByCab.get(assignVehicle.cabNumber);
                      const current = s === 'MORNING' ? row?.morning : row?.evening;
                      setAssignDriverId(current?.driverId ?? '');
                    }
                  }}
                  className={`flex-1 rounded-xl border-2 p-3 text-center transition-colors ${
                    assignShift === s
                      ? s === 'MORNING'
                        ? 'border-blue-500 bg-blue-50 text-blue-700'
                        : 'border-purple-500 bg-purple-50 text-purple-700'
                      : 'border-gray-200 text-gray-500 hover:border-gray-300'
                  }`}
                >
                  <p className="text-sm font-semibold">{s === 'MORNING' ? 'Morning' : 'Evening'}</p>
                </button>
              ))}
            </div>
          </div>

          <Select label="Driver" value={assignDriverId} onChange={(e) => setAssignDriverId(e.target.value)}>
            <option value="">— Unassign (no driver) —</option>
            {drivers.map((d) => <option key={d.id} value={d.id}>{d.name}</option>)}
          </Select>

          <p className="text-xs text-gray-400">
            Assigning here will automatically end any current active assignment for this cab/shift — and for the selected driver, if they&apos;re already on another cab.
          </p>

          {assignError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{assignError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setAssignVehicle(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveAssignment} disabled={assignSaving}>
              {assignSaving ? 'Saving…' : assignDriverId ? 'Assign Driver' : 'Unassign'}
            </Button>
          </div>
        </div>
      </Modal>

      {/* Upload Document Modal */}
      <Modal open={showDocModal} onClose={() => setShowDocModal(false)} title={`Upload Document — Cab #${docVehicle?.cabNumber}`}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">
              Label <span className="text-xs font-normal text-gray-400">(e.g. License, Ownership, Insurance)</span>
            </label>
            <input type="text" value={docLabel} placeholder="e.g. License"
              onChange={e => setDocLabel(e.target.value)}
              className="h-10 w-full rounded-lg border border-gray-300 bg-white px-3 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">File</label>
            <input
              type="file"
              accept=".pdf,.jpg,.jpeg,.png,.doc,.docx,.xls,.xlsx"
              onChange={e => setDocFile(e.target.files?.[0] ?? null)}
              className="block w-full text-sm text-gray-700 file:mr-3 file:rounded-lg file:border-0 file:bg-indigo-50 file:px-3 file:py-1.5 file:text-sm file:font-medium file:text-indigo-700 hover:file:bg-indigo-100"
            />
            {docFile && <p className="mt-1 text-xs text-gray-400">{docFile.name} · {formatFileSize(docFile.size)}</p>}
          </div>
          {docError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{docError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setShowDocModal(false)}>Cancel</Button>
            <Button variant="primary" onClick={saveDoc} disabled={savingDoc || !docFile}>
              {savingDoc ? 'Uploading…' : 'Upload'}
            </Button>
          </div>
        </div>
      </Modal>
    </>
  );
}

function DriverCell({ shift, assignment, onAssign }: {
  shift: 'MORNING' | 'EVENING';
  assignment: DriverRef | null;
  onAssign: () => void;
}) {
  const chipClass = shift === 'MORNING'
    ? 'bg-blue-50 text-blue-700 ring-blue-600/20 hover:bg-blue-100'
    : 'bg-purple-50 text-purple-700 ring-purple-600/20 hover:bg-purple-100';
  if (!assignment) {
    return (
      <button
        onClick={onAssign}
        className="inline-flex items-center gap-1 rounded-full px-2.5 py-0.5 text-xs font-medium text-gray-400 ring-1 ring-dashed ring-gray-300 hover:ring-indigo-400 hover:text-indigo-600 hover:bg-indigo-50 transition-colors"
      >
        + Assign
      </button>
    );
  }
  return (
    <div className="flex items-center gap-2">
      <Link
        href={`/drivers/${assignment.driverId}`}
        className={`inline-flex items-center rounded-full px-2.5 py-0.5 text-xs font-medium ring-1 transition-colors ${chipClass}`}
      >
        {assignment.driverName}
      </Link>
      <button
        onClick={onAssign}
        className="opacity-0 group-hover:opacity-100 transition-opacity text-xs text-indigo-500 hover:text-indigo-700"
      >
        Change
      </button>
    </div>
  );
}
