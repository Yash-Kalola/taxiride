'use client';
import { useState, useMemo } from 'react';
import Button from '@/components/ui/Button';
import Modal from '@/components/ui/Modal';
import Input from '@/components/ui/Input';
import Select from '@/components/ui/Select';
import PageHeader from '@/components/ui/PageHeader';
import { MONTHS } from '@/lib/constants';
import { format } from 'date-fns';

interface HallconRoute {
  id: string;
  routeName: string;
  pickupLocation: string;
  dropoffLocation: string;
  distanceKm: number;
  driverPay: number;
  billingAmount: number;
  isActive: boolean;
  _count: { trips: number };
}

interface HallconTrip {
  id: string;
  routeId: string;
  route: { id: string; routeName: string; pickupLocation: string; dropoffLocation: string };
  tripNumber: string;
  date: string;
  driver: string;
  vehicleNumber: string;
  passengers: number;
  duration: string;
  driverPay: number;
  billingAmount: number;
  notes: string;
  month: number;
  year: number;
}

const EMPTY_ROUTE = { routeName: '', pickupLocation: '', dropoffLocation: '', distanceKm: 0, driverPay: 0, billingAmount: 0 };
const EMPTY_TRIP  = { routeId: '', tripNumber: '', date: '', driver: '', vehicleNumber: '', passengers: 1, duration: '', driverPay: 0, billingAmount: 0, notes: '' };

export default function HallconClient({
  initialRoutes,
  initialTrips,
}: {
  initialRoutes: HallconRoute[];
  initialTrips: HallconTrip[];
}) {
  const [routes, setRoutes]     = useState<HallconRoute[]>(initialRoutes);
  const [trips, setTrips]       = useState<HallconTrip[]>(initialTrips);
  const [tab, setTab]           = useState<'trips' | 'routes' | 'drivers'>('trips');

  // Route modal
  const [routeModal, setRouteModal]   = useState<'add' | 'edit' | null>(null);
  const [editingRoute, setEditingRoute] = useState<HallconRoute | null>(null);
  const [routeForm, setRouteForm]     = useState(EMPTY_ROUTE);
  const [routeSaving, setRouteSaving] = useState(false);
  const [routeError, setRouteError]   = useState('');

  // Trip modal
  const [tripModal, setTripModal]     = useState<'add' | 'edit' | null>(null);
  const [editingTrip, setEditingTrip] = useState<HallconTrip | null>(null);
  const [tripForm, setTripForm]       = useState(EMPTY_TRIP);
  const [tripSaving, setTripSaving]   = useState(false);
  const [tripError, setTripError]     = useState('');

  // Filters
  const now = new Date();
  const [filterMonth, setFilterMonth] = useState<number>(now.getMonth() + 1);
  const [filterYear, setFilterYear]   = useState<number>(now.getFullYear());

  const [deleteTarget, setDeleteTarget] = useState<{ type: 'route' | 'trip'; id: string } | null>(null);

  // Filtered trips
  const filteredTrips = useMemo(
    () => trips.filter(t => t.month === filterMonth && t.year === filterYear),
    [trips, filterMonth, filterYear]
  );

  // Summary
  const totalBilling  = filteredTrips.reduce((s, t) => s + t.billingAmount, 0);
  const totalDriverPay = filteredTrips.reduce((s, t) => s + t.driverPay, 0);
  const profit = totalBilling - totalDriverPay;

  // Per-driver pay summary for the selected period (Yash: "driver pay
  // option somewhere just only for hallcon page"). Aggregates driver pay,
  // trip count, and total billing per driver.
  const driverPaySummary = useMemo(() => {
    const map = new Map<string, { driver: string; trips: number; pay: number; billing: number }>();
    for (const t of filteredTrips) {
      const key = (t.driver || '— Unassigned —').trim();
      const cur = map.get(key) ?? { driver: key, trips: 0, pay: 0, billing: 0 };
      cur.trips   += 1;
      cur.pay     += t.driverPay;
      cur.billing += t.billingAmount;
      map.set(key, cur);
    }
    return Array.from(map.values()).sort((a, b) => b.pay - a.pay);
  }, [filteredTrips]);

  // --- Route CRUD ---
  function openAddRoute() { setRouteForm(EMPTY_ROUTE); setEditingRoute(null); setRouteError(''); setRouteModal('add'); }
  function openEditRoute(r: HallconRoute) {
    setRouteForm({ routeName: r.routeName, pickupLocation: r.pickupLocation, dropoffLocation: r.dropoffLocation, distanceKm: r.distanceKm, driverPay: r.driverPay, billingAmount: r.billingAmount });
    setEditingRoute(r); setRouteError(''); setRouteModal('edit');
  }

  async function saveRoute() {
    setRouteSaving(true); setRouteError('');
    try {
      const url    = routeModal === 'edit' ? `/api/hallcon/routes/${editingRoute!.id}` : '/api/hallcon/routes';
      const method = routeModal === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(routeForm) });
      const data = await res.json();
      if (!res.ok) { setRouteError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error)); return; }
      const updated = await fetch('/api/hallcon/routes').then(r => r.json());
      setRoutes(updated);
      setRouteModal(null);
    } catch { setRouteError('Network error'); }
    finally { setRouteSaving(false); }
  }

  // --- Trip CRUD ---
  function openAddTrip() {
    setTripForm({ ...EMPTY_TRIP, date: format(new Date(), 'yyyy-MM-dd') });
    setEditingTrip(null); setTripError(''); setTripModal('add');
  }
  function openEditTrip(t: HallconTrip) {
    setTripForm({
      routeId: t.routeId, tripNumber: t.tripNumber ?? '',
      date: format(new Date(t.date), 'yyyy-MM-dd'),
      driver: t.driver, vehicleNumber: t.vehicleNumber, passengers: t.passengers,
      duration: t.duration ?? '',
      driverPay: t.driverPay, billingAmount: t.billingAmount, notes: t.notes,
    });
    setEditingTrip(t); setTripError(''); setTripModal('edit');
  }

  // Auto-fill from route selection
  function handleRouteSelect(routeId: string) {
    const route = routes.find(r => r.id === routeId);
    if (route) {
      setTripForm(f => ({ ...f, routeId, driverPay: route.driverPay, billingAmount: route.billingAmount }));
    } else {
      setTripForm(f => ({ ...f, routeId }));
    }
  }

  async function saveTrip() {
    setTripSaving(true); setTripError('');
    try {
      const url    = tripModal === 'edit' ? `/api/hallcon/trips/${editingTrip!.id}` : '/api/hallcon/trips';
      const method = tripModal === 'edit' ? 'PUT' : 'POST';
      const res = await fetch(url, { method, headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(tripForm) });
      const data = await res.json();
      if (!res.ok) { setTripError(typeof data.error === 'string' ? data.error : JSON.stringify(data.error)); return; }
      const updated = await fetch('/api/hallcon/trips').then(r => r.json());
      setTrips(updated);
      setTripModal(null);
    } catch { setTripError('Network error'); }
    finally { setTripSaving(false); }
  }

  // --- Delete ---
  async function confirmDelete() {
    if (!deleteTarget) return;
    const { type, id } = deleteTarget;
    try {
      const url = type === 'route' ? `/api/hallcon/routes/${id}` : `/api/hallcon/trips/${id}`;
      const res = await fetch(url, { method: 'DELETE' });
      if (res.ok || res.status === 204) {
        if (type === 'route') setRoutes(prev => prev.filter(r => r.id !== id));
        else setTrips(prev => prev.filter(t => t.id !== id));
      } else { alert('Delete failed'); }
    } catch { alert('Network error'); }
    setDeleteTarget(null);
  }

  const activeRoutes = routes.filter(r => r.isActive);

  return (
    <>
      <PageHeader
        title="Hallcon"
        description={`${routes.length} routes · ${filteredTrips.length} trips this period`}
        action={
          <div className="flex gap-2">
            <Button variant="ghost" onClick={openAddRoute}>+ Route</Button>
            <Button variant="primary" onClick={openAddTrip}>+ Log Trip</Button>
          </div>
        }
      />

      {/* Tabs */}
      <div className="flex gap-1 rounded-lg bg-gray-100 p-1 w-fit">
        <button onClick={() => setTab('trips')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'trips' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Trips
        </button>
        <button onClick={() => setTab('drivers')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'drivers' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Driver Pay
        </button>
        <button onClick={() => setTab('routes')} className={`px-4 py-2 text-sm font-medium rounded-md transition-colors ${tab === 'routes' ? 'bg-white shadow text-gray-900' : 'text-gray-500 hover:text-gray-700'}`}>
          Routes
        </button>
      </div>

      {tab === 'trips' && (
        <>
          {/* Filters + Summary */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))} className="w-32">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))} className="w-24">
              {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
            <div className="ml-auto flex gap-4 text-sm">
              <span className="text-gray-500">Revenue: <strong className="text-gray-900">${totalBilling.toFixed(2)}</strong></span>
              <span className="text-gray-500">Driver Pay: <strong className="text-red-600">${totalDriverPay.toFixed(2)}</strong></span>
              <span className="text-gray-500">Profit: <strong className={profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>${profit.toFixed(2)}</strong></span>
            </div>
          </div>

          {filteredTrips.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
              <p className="text-sm font-medium text-gray-500">No trips for {MONTHS[filterMonth - 1]} {filterYear}</p>
              <Button variant="primary" className="mt-4" onClick={openAddTrip}>+ Log Trip</Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Date', 'Trip #', 'Route', 'Driver', 'Cab #', 'Pax', 'Duration', 'Driver Pay', 'Billing', 'Profit', ''].map(h => (
                      <th key={h} className="px-4 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {filteredTrips.map(t => {
                    const p = t.billingAmount - t.driverPay;
                    return (
                      <tr key={t.id} className="group hover:bg-gray-50 transition-colors">
                        <td className="px-4 py-3.5 text-sm text-gray-700">{format(new Date(t.date), 'MMM d')}</td>
                        <td className="px-4 py-3.5 text-sm font-mono text-gray-700">{t.tripNumber || '—'}</td>
                        <td className="px-4 py-3.5 text-sm font-medium text-gray-900">{t.route.routeName}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{t.driver || '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{t.vehicleNumber || '—'}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{t.passengers}</td>
                        <td className="px-4 py-3.5 text-sm text-gray-600">{t.duration || '—'}</td>
                        <td className="px-4 py-3.5 text-sm font-medium text-red-600">${t.driverPay.toFixed(2)}</td>
                        <td className="px-4 py-3.5 text-sm font-medium text-gray-900">${t.billingAmount.toFixed(2)}</td>
                        <td className="px-4 py-3.5 text-sm font-bold">
                          <span className={p >= 0 ? 'text-emerald-600' : 'text-red-600'}>${p.toFixed(2)}</span>
                        </td>
                        <td className="px-4 py-3.5">
                          <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                            <Button size="sm" variant="ghost" onClick={() => openEditTrip(t)}>Edit</Button>
                            <Button size="sm" variant="ghost" onClick={() => setDeleteTarget({ type: 'trip', id: t.id })} className="text-red-500">Del</Button>
                          </div>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td colSpan={7} className="px-4 py-3.5 text-xs font-bold uppercase text-gray-500">Totals</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-red-600">${totalDriverPay.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-sm font-bold text-gray-900">${totalBilling.toFixed(2)}</td>
                    <td className="px-4 py-3.5 text-sm font-bold">
                      <span className={profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>${profit.toFixed(2)}</span>
                    </td>
                    <td></td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'drivers' && (
        <>
          {/* Filters */}
          <div className="flex items-center gap-3 flex-wrap">
            <Select value={filterMonth} onChange={e => setFilterMonth(parseInt(e.target.value))} className="w-32">
              {MONTHS.map((m, i) => <option key={m} value={i + 1}>{m}</option>)}
            </Select>
            <Select value={filterYear} onChange={e => setFilterYear(parseInt(e.target.value))} className="w-24">
              {[2023, 2024, 2025, 2026, 2027].map(y => <option key={y} value={y}>{y}</option>)}
            </Select>
            <p className="text-sm text-gray-400 ml-2">Driver pay totals for {MONTHS[filterMonth - 1]} {filterYear}</p>
          </div>

          {driverPaySummary.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
              <p className="text-sm font-medium text-gray-500">No driver pay to show for {MONTHS[filterMonth - 1]} {filterYear}</p>
              <p className="mt-1 text-xs text-gray-400">Log Hallcon trips to see per-driver pay totals here.</p>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Driver', 'Trips', 'Total Driver Pay', 'Total Billing', 'Profit Contribution'].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {driverPaySummary.map(d => {
                    const profit = d.billing - d.pay;
                    return (
                      <tr key={d.driver} className="hover:bg-gray-50 transition-colors">
                        <td className="px-5 py-4 text-sm font-semibold text-gray-900">{d.driver}</td>
                        <td className="px-5 py-4 text-sm text-gray-600">{d.trips}</td>
                        <td className="px-5 py-4 text-sm font-bold text-red-600">${d.pay.toFixed(2)}</td>
                        <td className="px-5 py-4 text-sm text-gray-700">${d.billing.toFixed(2)}</td>
                        <td className="px-5 py-4 text-sm font-bold">
                          <span className={profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>${profit.toFixed(2)}</span>
                        </td>
                      </tr>
                    );
                  })}
                </tbody>
                <tfoot>
                  <tr className="border-t-2 border-gray-200 bg-gray-50">
                    <td className="px-5 py-3.5 text-xs font-bold uppercase text-gray-500">Totals</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-gray-700">{driverPaySummary.reduce((s, d) => s + d.trips, 0)}</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-red-600">${totalDriverPay.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-sm font-bold text-gray-900">${totalBilling.toFixed(2)}</td>
                    <td className="px-5 py-3.5 text-sm font-bold">
                      <span className={profit >= 0 ? 'text-emerald-600' : 'text-red-600'}>${profit.toFixed(2)}</span>
                    </td>
                  </tr>
                </tfoot>
              </table>
            </div>
          )}
        </>
      )}

      {tab === 'routes' && (
        <>
          {routes.length === 0 ? (
            <div className="rounded-2xl border-2 border-dashed border-gray-200 bg-white py-16 text-center">
              <p className="text-sm font-medium text-gray-500">No routes defined yet</p>
              <Button variant="primary" className="mt-4" onClick={openAddRoute}>+ Add Route</Button>
            </div>
          ) : (
            <div className="overflow-hidden rounded-2xl bg-white shadow-sm ring-1 ring-gray-200">
              <table className="w-full">
                <thead>
                  <tr className="border-b border-gray-100 bg-gray-50">
                    {['Route', 'Pickup', 'Dropoff', 'KM', 'Driver Pay', 'Billing', 'Trips', ''].map(h => (
                      <th key={h} className="px-5 py-3.5 text-left text-xs font-semibold uppercase tracking-wide text-gray-400">{h}</th>
                    ))}
                  </tr>
                </thead>
                <tbody className="divide-y divide-gray-50">
                  {routes.map(r => (
                    <tr key={r.id} className={`group hover:bg-gray-50 transition-colors ${!r.isActive ? 'opacity-50' : ''}`}>
                      <td className="px-5 py-4">
                        <p className="font-semibold text-sm text-gray-900">{r.routeName}</p>
                        {!r.isActive && <span className="text-xs text-red-400">inactive</span>}
                      </td>
                      <td className="px-5 py-4 text-sm text-gray-600">{r.pickupLocation || '—'}</td>
                      <td className="px-5 py-4 text-sm text-gray-600">{r.dropoffLocation || '—'}</td>
                      <td className="px-5 py-4 text-sm text-gray-700 font-medium">{r.distanceKm} km</td>
                      <td className="px-5 py-4 text-sm font-medium text-red-600">${r.driverPay.toFixed(2)}</td>
                      <td className="px-5 py-4 text-sm font-medium text-gray-900">${r.billingAmount.toFixed(2)}</td>
                      <td className="px-5 py-4 text-sm text-gray-700">{r._count.trips}</td>
                      <td className="px-5 py-4">
                        <div className="flex gap-1 opacity-0 group-hover:opacity-100 transition-opacity">
                          <Button size="sm" variant="ghost" onClick={() => openEditRoute(r)}>Edit</Button>
                          <Button size="sm" variant="ghost" onClick={() => setDeleteTarget({ type: 'route', id: r.id })} className="text-red-500">Del</Button>
                        </div>
                      </td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </>
      )}

      {/* Route Modal */}
      <Modal open={routeModal !== null} onClose={() => setRouteModal(null)} title={routeModal === 'edit' ? 'Edit Route' : 'New Route'}>
        <div className="space-y-4">
          <Input label="Route Name" placeholder="Timmins → Kapuskasing" value={routeForm.routeName} onChange={e => setRouteForm(f => ({ ...f, routeName: e.target.value }))} />
          <div className="grid grid-cols-2 gap-4">
            <Input label="Pickup Location" placeholder="Timmins Station" value={routeForm.pickupLocation} onChange={e => setRouteForm(f => ({ ...f, pickupLocation: e.target.value }))} />
            <Input label="Dropoff Location" placeholder="Kapuskasing Depot" value={routeForm.dropoffLocation} onChange={e => setRouteForm(f => ({ ...f, dropoffLocation: e.target.value }))} />
          </div>
          <div className="grid grid-cols-3 gap-4">
            <Input label="Distance (km)" type="number" min={0} value={String(routeForm.distanceKm)} onChange={e => setRouteForm(f => ({ ...f, distanceKm: parseFloat(e.target.value) || 0 }))} />
            <Input label="Driver Pay ($)" type="number" min={0} step="0.01" value={String(routeForm.driverPay)} onChange={e => setRouteForm(f => ({ ...f, driverPay: parseFloat(e.target.value) || 0 }))} />
            <Input label="Billing Amount ($)" type="number" min={0} step="0.01" value={String(routeForm.billingAmount)} onChange={e => setRouteForm(f => ({ ...f, billingAmount: parseFloat(e.target.value) || 0 }))} />
          </div>
          {routeError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{routeError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setRouteModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveRoute} disabled={routeSaving}>{routeSaving ? 'Saving...' : 'Save Route'}</Button>
          </div>
        </div>
      </Modal>

      {/* Trip Modal */}
      <Modal open={tripModal !== null} onClose={() => setTripModal(null)} title={tripModal === 'edit' ? 'Edit Trip' : 'Log Trip'}>
        <div className="space-y-4">
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Route</label>
            <Select value={tripForm.routeId} onChange={e => handleRouteSelect(e.target.value)}>
              <option value="">— Select Route —</option>
              {activeRoutes.map(r => (
                <option key={r.id} value={r.id}>{r.routeName} ({r.distanceKm} km)</option>
              ))}
            </Select>
            {tripForm.routeId && (
              <p className="mt-1 text-xs text-gray-400">
                Auto-filled: Driver ${routes.find(r => r.id === tripForm.routeId)?.driverPay.toFixed(2)} / Billing ${routes.find(r => r.id === tripForm.routeId)?.billingAmount.toFixed(2)}
              </p>
            )}
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Trip #" placeholder="T-100" value={tripForm.tripNumber} onChange={e => setTripForm(f => ({ ...f, tripNumber: e.target.value }))} />
            <Input label="Date" type="date" value={tripForm.date} onChange={e => setTripForm(f => ({ ...f, date: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Driver" placeholder="Driver name" value={tripForm.driver} onChange={e => setTripForm(f => ({ ...f, driver: e.target.value }))} />
            <Input label="Cab #" placeholder="30" value={tripForm.vehicleNumber} onChange={e => setTripForm(f => ({ ...f, vehicleNumber: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Passengers" type="number" min={1} value={String(tripForm.passengers)} onChange={e => setTripForm(f => ({ ...f, passengers: parseInt(e.target.value) || 1 }))} />
            <Input label="Duration" placeholder="3 hours" hint="Free text — e.g. '3 hours' or '4h 30m'" value={tripForm.duration} onChange={e => setTripForm(f => ({ ...f, duration: e.target.value }))} />
          </div>
          <div className="grid grid-cols-2 gap-4">
            <Input label="Driver Pay ($)" type="number" min={0} step="0.01" value={String(tripForm.driverPay)} onChange={e => setTripForm(f => ({ ...f, driverPay: parseFloat(e.target.value) || 0 }))} />
            <Input label="Billing Amount ($)" type="number" min={0} step="0.01" value={String(tripForm.billingAmount)} onChange={e => setTripForm(f => ({ ...f, billingAmount: parseFloat(e.target.value) || 0 }))} />
          </div>
          <div>
            <label className="block text-sm font-medium text-gray-700 mb-1">Notes</label>
            <textarea
              value={tripForm.notes}
              onChange={e => setTripForm(f => ({ ...f, notes: e.target.value }))}
              rows={2}
              placeholder="Additional info..."
              className="block w-full rounded-lg border border-gray-300 bg-white px-3 py-2 text-sm text-gray-700 focus:outline-none focus:ring-2 focus:ring-indigo-500"
            />
          </div>
          {tripError && <p className="rounded-lg bg-red-50 px-3 py-2 text-sm text-red-600">{tripError}</p>}
          <div className="flex justify-end gap-2 pt-2">
            <Button variant="ghost" onClick={() => setTripModal(null)}>Cancel</Button>
            <Button variant="primary" onClick={saveTrip} disabled={tripSaving}>{tripSaving ? 'Saving...' : 'Save Trip'}</Button>
          </div>
        </div>
      </Modal>

      {/* Delete confirm */}
      <Modal open={deleteTarget !== null} onClose={() => setDeleteTarget(null)} title={`Delete ${deleteTarget?.type === 'route' ? 'Route' : 'Trip'}`} size="sm">
        <p className="text-sm text-gray-600 mb-5">
          {deleteTarget?.type === 'route'
            ? 'This will delete the route and ALL trips logged against it. This cannot be undone.'
            : 'This will permanently delete this trip. This cannot be undone.'}
        </p>
        <div className="flex justify-end gap-2">
          <Button variant="ghost" onClick={() => setDeleteTarget(null)}>Cancel</Button>
          <Button variant="danger" onClick={confirmDelete}>Delete</Button>
        </div>
      </Modal>
    </>
  );
}
