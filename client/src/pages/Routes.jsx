import React, { useEffect, useState, useMemo, useRef } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { apiFetch } from '../api';
import { useSocket } from '../context/SocketContext';
import {
  Route as RouteIcon,
  Navigation,
  Cpu,
  Truck,
  User,
  Fuel,
  MapPin,
  Clock,
  CheckCircle2,
  AlertCircle,
  RefreshCw,
  Search,
  Filter,
  ChevronRight,
  Warehouse,
  Sparkles,
  ArrowRight,
  TrendingDown,
  Gauge,
  Check,
  X,
  Layers,
  Trash2,
  Plus
} from 'lucide-react';

// Custom Map Bounds Auto-Fitter
function MapBoundsFitter({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [45, 45], maxZoom: 15, animate: true });
    }
  }, [bounds, map]);
  return null;
}

// Marker for Depot
const createDepotIcon = () => {
  return L.divIcon({
    className: 'custom-depot-icon',
    html: `
      <div style="position: relative; width: 38px; height: 38px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 44px; height: 44px; border-radius: 50%; background-color: rgba(234, 179, 8, 0.35); animation: ping 2s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>
        <div style="position: relative; width: 36px; height: 36px; border-radius: 50%; background: linear-gradient(135deg, #1e293b, #0f172a); border: 2.5px solid #eab308; box-shadow: 0 4px 10px rgba(0,0,0,0.45); display: flex; flex-direction: column; align-items: center; justify-content: center; color: #eab308;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [38, 38],
    iconAnchor: [19, 19],
    popupAnchor: [0, -19]
  });
};

// Marker for Numbered Stop with Fill Level Color
const createStopIcon = (stopNumber, fillPercent, isCollected) => {
  let bgColor = '#10b981'; // Green <50%
  let borderColor = '#059669';

  if (isCollected) {
    bgColor = '#64748b';
    borderColor = '#475569';
  } else if (fillPercent >= 80) {
    bgColor = '#ef4444'; // Red >=80%
    borderColor = '#dc2626';
  } else if (fillPercent >= 50) {
    bgColor = '#f97316'; // Orange 50-79%
    borderColor = '#ea580c';
  }

  return L.divIcon({
    className: 'custom-stop-marker',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        ${fillPercent >= 80 && !isCollected ? `<div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background-color: rgba(239, 68, 68, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
        <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; background-color: ${bgColor}; border: 2.5px solid #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 12px; font-weight: 800; font-family: ui-sans-serif, system-ui, sans-serif;">
          ${isCollected ? '✓' : stopNumber}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

export default function Routes() {
  const [routes, setRoutes] = useState([]);
  const [selectedRouteId, setSelectedRouteId] = useState(null);
  const [activeRouteDetail, setActiveRouteDetail] = useState(null);
  const [pendingRequestsCount, setPendingRequestsCount] = useState(0);
  const [loading, setLoading] = useState(true);
  const [detailLoading, setDetailLoading] = useState(false);
  const [generating, setGenerating] = useState(false);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [actionAlert, setActionAlert] = useState(null);

  // Manual Assignment Modal State
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [availableDrivers, setAvailableDrivers] = useState([]);
  const [availableVehicles, setAvailableVehicles] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState('');
  const [selectedVehicleId, setSelectedVehicleId] = useState('');
  const [assigning, setAssigning] = useState(false);

  const { socket } = useSocket();

  // Fetch routes list and pending requests count
  const fetchRoutes = async (keepSelection = true) => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/routes');
      if (res.ok) {
        const data = await res.json();
        setRoutes(data);

        // Auto-select first route if none selected or invalid
        if (data.length > 0) {
          if (!keepSelection || !selectedRouteId || !data.some((r) => r.id === selectedRouteId)) {
            setSelectedRouteId(data[0].id);
          }
        } else {
          setSelectedRouteId(null);
          setActiveRouteDetail(null);
        }
      }

      // Check pending collection requests count
      const reqRes = await apiFetch('/api/requests?status=pending');
      if (reqRes.ok) {
        const reqData = await reqRes.json();
        setPendingRequestsCount(reqData.length);
      }
    } catch (err) {
      console.error('Failed to fetch routes:', err);
    } finally {
      setLoading(false);
    }
  };

  // Fetch single route detail when selectedRouteId changes
  const fetchRouteDetail = async (routeId) => {
    if (!routeId) return;
    try {
      setDetailLoading(true);
      const res = await apiFetch(`/api/routes/${routeId}`);
      if (res.ok) {
        const data = await res.json();
        setActiveRouteDetail(data);
      }
    } catch (err) {
      console.error(`Failed to fetch route ${routeId} details:`, err);
    } finally {
      setDetailLoading(false);
    }
  };

  useEffect(() => {
    fetchRoutes(false);
  }, []);

  useEffect(() => {
    if (selectedRouteId) {
      fetchRouteDetail(selectedRouteId);
    }
  }, [selectedRouteId]);

  // Socket.IO real-time subscriptions
  useEffect(() => {
    if (!socket) return;

    const handleRouteCreated = (newRoute) => {
      setRoutes((prev) => [newRoute, ...prev.filter((r) => r.id !== newRoute.id)]);
      setSelectedRouteId(newRoute.id);
      fetchRoutes(true);
    };

    const handleRouteUpdated = (updated) => {
      setRoutes((prev) => prev.map((r) => (r.id === updated.id ? { ...r, ...updated } : r)));
      if (selectedRouteId === updated.id) {
        fetchRouteDetail(updated.id);
      }
    };

    const handleRouteDeleted = ({ id }) => {
      setRoutes((prev) => prev.filter((r) => r.id !== id));
      if (selectedRouteId === id) {
        setSelectedRouteId(null);
      }
      fetchRoutes(false);
    };

    const handleRequestsUpdated = () => {
      apiFetch('/api/requests?status=pending')
        .then((res) => res.json())
        .then((data) => setPendingRequestsCount(data.length))
        .catch(() => {});
    };

    socket.on('route:created', handleRouteCreated);
    socket.on('route:updated', handleRouteUpdated);
    socket.on('route:deleted', handleRouteDeleted);
    socket.on('request:created', handleRequestsUpdated);
    socket.on('request:updated', handleRequestsUpdated);
    socket.on('request:deleted', handleRequestsUpdated);

    return () => {
      socket.off('route:created', handleRouteCreated);
      socket.off('route:updated', handleRouteUpdated);
      socket.off('route:deleted', handleRouteDeleted);
      socket.off('request:created', handleRequestsUpdated);
      socket.off('request:updated', handleRequestsUpdated);
      socket.off('request:deleted', handleRequestsUpdated);
    };
  }, [socket, selectedRouteId]);

  // Generate Optimized Route handler
  const handleGenerateRoute = async () => {
    if (pendingRequestsCount === 0) {
      setActionAlert({
        type: 'warning',
        message: 'No pending collection requests to optimize. Bins must reach >80% or have requests submitted.'
      });
      return;
    }

    try {
      setGenerating(true);
      setActionAlert(null);
      const res = await apiFetch('/api/routes/generate', {
        method: 'POST'
      });

      const data = await res.json();
      if (res.ok) {
        setActionAlert({
          type: 'success',
          message: data.message || 'Optimized collection route generated successfully using 2-Opt TSP!'
        });
        await fetchRoutes(false);
        if (data.routes && data.routes.length > 0) {
          setSelectedRouteId(data.routes[0].id);
        }
      } else {
        setActionAlert({
          type: 'error',
          message: data.error || 'Failed to generate optimized route.'
        });
      }
    } catch (err) {
      console.error('Error generating route:', err);
      setActionAlert({
        type: 'error',
        message: 'Network error occurred while computing optimal route.'
      });
    } finally {
      setGenerating(false);
    }
  };

  // Open Manual Assign Modal
  const openAssignModal = async () => {
    try {
      const [driversRes, vehiclesRes] = await Promise.all([
        apiFetch('/api/drivers?availability=available'),
        apiFetch('/api/vehicles?status=available')
      ]);

      const drivers = await driversRes.json();
      const vehicles = await vehiclesRes.json();

      setAvailableDrivers(drivers);
      setAvailableVehicles(vehicles);

      setSelectedDriverId(activeRouteDetail?.driver_id || (drivers[0]?.id || ''));
      setSelectedVehicleId(activeRouteDetail?.vehicle_id || (vehicles[0]?.id || ''));
      setIsAssignModalOpen(true);
    } catch (err) {
      console.error('Failed to load assign options:', err);
    }
  };

  const handleAssignSubmit = async (e) => {
    e.preventDefault();
    if (!selectedRouteId) return;

    try {
      setAssigning(true);
      const res = await apiFetch(`/api/routes/${selectedRouteId}/assign`, {
        method: 'PUT',
        body: JSON.stringify({
          driver_id: selectedDriverId ? Number(selectedDriverId) : null,
          vehicle_id: selectedVehicleId ? Number(selectedVehicleId) : null
        })
      });

      if (res.ok) {
        setIsAssignModalOpen(false);
        setActionAlert({
          type: 'success',
          message: 'Driver and vehicle assigned successfully!'
        });
        fetchRoutes(true);
        fetchRouteDetail(selectedRouteId);
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to assign driver and vehicle');
      }
    } catch (err) {
      console.error('Error assigning:', err);
    } finally {
      setAssigning(false);
    }
  };

  // Filter routes
  const filteredRoutes = useMemo(() => {
    return routes.filter((r) => {
      const matchesStatus = statusFilter === 'all' || r.status === statusFilter;
      const matchesSearch =
        search === '' ||
        r.name.toLowerCase().includes(search.toLowerCase()) ||
        (r.driver_name && r.driver_name.toLowerCase().includes(search.toLowerCase())) ||
        (r.vehicle_plate && r.vehicle_plate.toLowerCase().includes(search.toLowerCase()));
      return matchesStatus && matchesSearch;
    });
  }, [routes, statusFilter, search]);

  // Map Coordinates & Bounds Preparation
  const { polylineCoords, mapBounds, depotCoord } = useMemo(() => {
    if (!activeRouteDetail) {
      return { polylineCoords: [], mapBounds: [], depotCoord: [12.9716, 77.5946] };
    }

    const depot = activeRouteDetail.depot || { latitude: 12.9716, longitude: 77.5946 };
    const depotPair = [depot.latitude, depot.longitude];

    const stops = activeRouteDetail.stops || [];
    const stopPairs = stops.map((s) => [s.latitude, s.longitude]);

    // Tour: Depot -> Stops in order -> Depot
    const poly = [depotPair, ...stopPairs, depotPair];
    const bounds = [depotPair, ...stopPairs];

    return {
      polylineCoords: poly,
      mapBounds: bounds,
      depotCoord: depotPair
    };
  }, [activeRouteDetail]);

  return (
    <div className="space-y-6">
      {/* Top Banner & Header */}
      <div className="flex flex-col lg:flex-row lg:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-6 rounded-2xl shadow-lg border border-slate-800 text-white">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <RouteIcon className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                Route Optimization Engine
                <span className="text-[10px] uppercase font-bold tracking-wider px-2 py-0.5 rounded-full bg-teal-500/20 text-teal-300 border border-teal-500/30">
                  2-Opt TSP
                </span>
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Nearest-Neighbor heuristics with 2-Opt local search uncrossing, central depot loop, and fuel prediction.
              </p>
            </div>
          </div>

          {/* Quick Route Status Counters */}
          <div className="flex flex-wrap items-center gap-3 mt-4 text-xs font-semibold">
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-slate-800/80 border border-slate-700 text-slate-300">
              <span>Total Routes:</span>
              <span className="text-white font-bold">{routes.length}</span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-sky-950/60 border border-sky-800/50 text-sky-300">
              <span>Planned:</span>
              <span className="text-white font-bold">
                {routes.filter((r) => r.status === 'planned').length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-amber-950/60 border border-amber-800/50 text-amber-300">
              <span>In-Progress:</span>
              <span className="text-white font-bold">
                {routes.filter((r) => r.status === 'in_progress').length}
              </span>
            </div>
            <div className="flex items-center gap-1.5 px-3 py-1 rounded-lg bg-emerald-950/60 border border-emerald-800/50 text-emerald-300">
              <span>Completed:</span>
              <span className="text-white font-bold">
                {routes.filter((r) => r.status === 'completed').length}
              </span>
            </div>
          </div>
        </div>

        {/* Primary Action Button */}
        <div className="flex flex-col sm:flex-row items-stretch sm:items-center gap-3">
          <button
            type="button"
            onClick={handleGenerateRoute}
            disabled={generating}
            className={`inline-flex items-center justify-center gap-2.5 px-5 py-3 rounded-xl font-bold text-xs tracking-wide uppercase transition-all shadow-lg ${
              generating
                ? 'bg-slate-700 text-slate-400 cursor-not-allowed'
                : 'bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-teal-900/40 active:scale-95'
            }`}
          >
            {generating ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Optimizing Route with 2-Opt...
              </>
            ) : (
              <>
                <Sparkles className="h-4 w-4 text-amber-300 animate-pulse" />
                Generate Optimized Route
                {pendingRequestsCount > 0 && (
                  <span className="ml-1 px-2 py-0.5 rounded-full bg-black/30 text-amber-300 text-[11px] font-extrabold border border-amber-300/30">
                    {pendingRequestsCount} Pending
                  </span>
                )}
              </>
            )}
          </button>
        </div>
      </div>

      {/* Action Notification Alert */}
      {actionAlert && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border ${
            actionAlert.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : actionAlert.type === 'warning'
              ? 'bg-amber-50 text-amber-800 border-amber-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {actionAlert.type === 'success' && <CheckCircle2 className="h-4 w-4 text-emerald-600" />}
            {actionAlert.type === 'warning' && <AlertCircle className="h-4 w-4 text-amber-600" />}
            {actionAlert.type === 'error' && <AlertCircle className="h-4 w-4 text-rose-600" />}
            <span>{actionAlert.message}</span>
          </div>
          <button
            onClick={() => setActionAlert(null)}
            className="text-slate-400 hover:text-slate-600 p-1"
          >
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Main Two-Column Master-Detail Layout */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Left Column: Routes List (4 cols) */}
        <div className="lg:col-span-4 space-y-4">
          <div className="bg-white rounded-2xl border border-slate-200/80 shadow-xs p-4 space-y-3">
            {/* Search Input */}
            <div className="relative">
              <Search className="h-4 w-4 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search route, driver, plate..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 border border-slate-200 rounded-lg text-xs text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500/20 focus:border-teal-500"
              />
              {search && (
                <button
                  onClick={() => setSearch('')}
                  className="absolute right-2.5 top-2.5 text-slate-400 hover:text-slate-600"
                >
                  <X className="h-3.5 w-3.5" />
                </button>
              )}
            </div>

            {/* Filter Tabs */}
            <div className="flex items-center gap-1 p-1 bg-slate-100 rounded-xl text-xs font-semibold">
              {['all', 'planned', 'in_progress', 'completed'].map((tab) => (
                <button
                  key={tab}
                  type="button"
                  onClick={() => setStatusFilter(tab)}
                  className={`flex-1 py-1.5 capitalize rounded-lg transition-all text-center ${
                    statusFilter === tab
                      ? 'bg-white text-slate-900 shadow-xs font-bold'
                      : 'text-slate-500 hover:text-slate-900'
                  }`}
                >
                  {tab.replace('_', ' ')}
                </button>
              ))}
            </div>
          </div>

          {/* Routes Cards List */}
          <div className="space-y-2.5 max-h-[720px] overflow-y-auto pr-1">
            {loading ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center text-xs text-slate-400">
                <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
                Loading collection routes...
              </div>
            ) : filteredRoutes.length === 0 ? (
              <div className="bg-white rounded-2xl border border-slate-200 p-8 text-center space-y-3">
                <div className="h-10 w-10 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                  <RouteIcon className="h-5 w-5" />
                </div>
                <div className="text-xs text-slate-500 font-medium">
                  {search || statusFilter !== 'all'
                    ? 'No routes match your search filters.'
                    : 'No collection routes created yet.'}
                </div>
              </div>
            ) : (
              filteredRoutes.map((rt) => {
                const isSelected = rt.id === selectedRouteId;
                const statusColors = {
                  planned: 'bg-sky-50 text-sky-700 border-sky-200',
                  in_progress: 'bg-amber-50 text-amber-700 border-amber-200',
                  completed: 'bg-emerald-50 text-emerald-700 border-emerald-200'
                };

                return (
                  <div
                    key={rt.id}
                    onClick={() => setSelectedRouteId(rt.id)}
                    className={`cursor-pointer rounded-xl border p-4 transition-all duration-150 ${
                      isSelected
                        ? 'bg-gradient-to-br from-teal-50/60 to-emerald-50/40 border-teal-500 shadow-md ring-1 ring-teal-500/20'
                        : 'bg-white border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 shadow-xs'
                    }`}
                  >
                    <div className="flex items-start justify-between gap-2">
                      <div className="space-y-1">
                        <h4 className="text-xs font-bold text-slate-900 line-clamp-1">{rt.name}</h4>
                        <div className="flex items-center gap-2 text-[11px] text-slate-500">
                          <span className="flex items-center gap-1 font-semibold text-slate-700">
                            <Navigation className="h-3 w-3 text-teal-600" />
                            {rt.total_distance_km} km
                          </span>
                          <span>•</span>
                          <span className="font-semibold text-slate-700">
                            {rt.stop_count} stops
                          </span>
                        </div>
                      </div>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md border ${
                          statusColors[rt.status] || 'bg-slate-100 text-slate-600 border-slate-200'
                        }`}
                      >
                        {rt.status.replace('_', ' ')}
                      </span>
                    </div>

                    <div className="mt-3 pt-3 border-t border-slate-100/90 flex items-center justify-between text-[11px] text-slate-500">
                      <div className="flex items-center gap-1.5">
                        <User className="h-3 w-3 text-slate-400" />
                        <span className="font-medium text-slate-700 truncate max-w-[120px]">
                          {rt.driver_name || <span className="text-amber-600 font-semibold">Unassigned</span>}
                        </span>
                      </div>

                      <div className="flex items-center gap-1.5 font-semibold text-slate-700">
                        <Fuel className="h-3 w-3 text-amber-500" />
                        <span>
                          {rt.estimated_fuel_liters ? `${rt.estimated_fuel_liters} L` : '~ L'}
                        </span>
                      </div>
                    </div>
                  </div>
                );
              })
            )}
          </div>
        </div>

        {/* Right Column: Route Details, Map & Stops Sequence (8 cols) */}
        <div className="lg:col-span-8 space-y-6">
          {detailLoading && !activeRouteDetail ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center text-xs text-slate-400">
              <div className="w-6 h-6 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
              Loading route telemetry & stops...
            </div>
          ) : !activeRouteDetail ? (
            <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
              <div className="h-12 w-12 rounded-full bg-slate-100 text-slate-400 mx-auto flex items-center justify-center">
                <RouteIcon className="h-6 w-6" />
              </div>
              <h3 className="text-sm font-bold text-slate-800">Select a Collection Route</h3>
              <p className="text-xs text-slate-500 max-w-sm mx-auto">
                Pick a route from the list on the left to inspect its turn-by-turn map visualization, stop sequencing, and estimated fuel metrics.
              </p>
            </div>
          ) : (
            <>
              {/* Route Summary Header Card */}
              <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-100 pb-4">
                  <div>
                    <div className="flex items-center gap-2">
                      <h3 className="text-base font-extrabold text-slate-900">
                        {activeRouteDetail.name}
                      </h3>
                      <span
                        className={`text-[10px] font-bold uppercase tracking-wider px-2.5 py-0.5 rounded-full border ${
                          activeRouteDetail.status === 'completed'
                            ? 'bg-emerald-50 text-emerald-700 border-emerald-200'
                            : activeRouteDetail.status === 'in_progress'
                            ? 'bg-amber-50 text-amber-700 border-amber-200'
                            : 'bg-sky-50 text-sky-700 border-sky-200'
                        }`}
                      >
                        {activeRouteDetail.status.replace('_', ' ')}
                      </span>
                    </div>
                    <p className="text-xs text-slate-500 mt-1 flex items-center gap-2">
                      <span>Created {new Date(activeRouteDetail.created_at).toLocaleString()}</span>
                      {activeRouteDetail.completed_at && (
                        <>
                          <span>•</span>
                          <span>
                            Completed {new Date(activeRouteDetail.completed_at).toLocaleString()}
                          </span>
                        </>
                      )}
                    </p>
                  </div>

                  <div className="flex items-center gap-2">
                    <button
                      type="button"
                      onClick={openAssignModal}
                      className="inline-flex items-center gap-1.5 px-3 py-1.5 rounded-lg bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-semibold transition-colors"
                    >
                      <User className="h-3.5 w-3.5 text-teal-600" />
                      {activeRouteDetail.driver_name ? 'Reassign Driver' : 'Assign Driver'}
                    </button>
                  </div>
                </div>

                {/* Key Metrics Grid */}
                <div className="grid grid-cols-2 sm:grid-cols-4 gap-3">
                  {/* Distance */}
                  <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium mb-1">
                      <Navigation className="h-3.5 w-3.5 text-teal-600" />
                      Total Distance
                    </div>
                    <div className="text-base font-black text-slate-800">
                      {activeRouteDetail.total_distance_km} <span className="text-xs font-normal text-slate-500">km</span>
                    </div>
                    <div className="text-[10px] text-teal-600 font-semibold mt-0.5">
                      Depot round-trip
                    </div>
                  </div>

                  {/* Stops */}
                  <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium mb-1">
                      <MapPin className="h-3.5 w-3.5 text-emerald-600" />
                      Stops Count
                    </div>
                    <div className="text-base font-black text-slate-800">
                      {activeRouteDetail.stops?.length || 0}{' '}
                      <span className="text-xs font-normal text-slate-500">bins</span>
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {activeRouteDetail.stops?.filter((s) => s.stop_status === 'collected').length || 0} collected
                    </div>
                  </div>

                  {/* Assigned Vehicle */}
                  <div className="bg-slate-50/80 rounded-xl p-3 border border-slate-100">
                    <div className="flex items-center gap-1.5 text-slate-400 text-[11px] font-medium mb-1">
                      <Truck className="h-3.5 w-3.5 text-indigo-600" />
                      Vehicle & Mileage
                    </div>
                    <div className="text-xs font-bold text-slate-800 truncate" title={activeRouteDetail.vehicle_model || 'Unassigned'}>
                      {activeRouteDetail.vehicle_model || 'Unassigned'}
                    </div>
                    <div className="text-[10px] text-slate-500 mt-0.5">
                      {activeRouteDetail.vehicle_mileage
                        ? `${activeRouteDetail.vehicle_mileage} km/L (${activeRouteDetail.vehicle_plate})`
                        : 'Fleet default (4.0 km/L)'}
                    </div>
                  </div>

                  {/* Estimated Fuel */}
                  <div className="bg-amber-50/60 rounded-xl p-3 border border-amber-200/70">
                    <div className="flex items-center gap-1.5 text-amber-700 text-[11px] font-semibold mb-1">
                      <Fuel className="h-3.5 w-3.5 text-amber-600" />
                      Estimated Fuel
                    </div>
                    <div className="text-base font-black text-amber-900">
                      {activeRouteDetail.estimated_fuel_liters ||
                        (activeRouteDetail.total_distance_km / 4.0).toFixed(1)}{' '}
                      <span className="text-xs font-normal text-amber-700">Liters</span>
                    </div>
                    <div className="text-[10px] text-amber-700 font-medium mt-0.5">
                      ~₹{Math.round((activeRouteDetail.estimated_fuel_liters || activeRouteDetail.total_distance_km / 4.0) * 94.5)} est. cost
                    </div>
                  </div>
                </div>
              </div>

              {/* Leaflet Route Map */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs overflow-hidden">
                <div className="px-5 py-3.5 bg-slate-900 text-white flex items-center justify-between">
                  <div className="flex items-center gap-2">
                    <Layers className="h-4 w-4 text-teal-400" />
                    <span className="text-xs font-bold tracking-wide uppercase">
                      Turn-by-Turn Route Polyline & Sequencing
                    </span>
                  </div>

                  {/* Map Legend */}
                  <div className="hidden sm:flex items-center gap-3 text-[11px] font-medium text-slate-300">
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-amber-400 border border-black inline-block"></span>
                      Depot (Base)
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 inline-block"></span>
                      &lt;50%
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-orange-500 inline-block"></span>
                      50-79%
                    </span>
                    <span className="flex items-center gap-1.5">
                      <span className="w-2.5 h-2.5 rounded-full bg-rose-500 inline-block"></span>
                      ≥80% (Critical)
                    </span>
                  </div>
                </div>

                <div className="h-[440px] w-full relative z-0">
                  <MapContainer
                    center={depotCoord}
                    zoom={12}
                    scrollWheelZoom={true}
                    className="h-full w-full"
                  >
                    <TileLayer
                      attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                      url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
                    />

                    {/* Auto-fit bounds */}
                    <MapBoundsFitter bounds={mapBounds} />

                    {/* Depot Marker */}
                    <Marker position={depotCoord} icon={createDepotIcon()}>
                      <Popup>
                        <div className="p-1 space-y-1">
                          <div className="font-extrabold text-xs text-amber-700 flex items-center gap-1">
                            <Warehouse className="h-3.5 w-3.5" />
                            {activeRouteDetail.depot?.name || 'Central Municipal Waste Depot'}
                          </div>
                          <div className="text-[11px] text-slate-600">
                            {activeRouteDetail.depot?.address || 'Cubbon Park Central Zone, Bengaluru'}
                          </div>
                          <div className="text-[10px] font-semibold text-slate-500 pt-1 border-t border-slate-100">
                            Route Dispatch & Final Unload Facility
                          </div>
                        </div>
                      </Popup>
                    </Marker>

                    {/* Stops Markers */}
                    {activeRouteDetail.stops?.map((stop) => (
                      <Marker
                        key={stop.stop_id}
                        position={[stop.latitude, stop.longitude]}
                        icon={createStopIcon(
                          stop.stop_order,
                          stop.current_fill_percent,
                          stop.stop_status === 'collected'
                        )}
                      >
                        <Popup>
                          <div className="p-1 space-y-1.5 text-xs">
                            <div className="flex items-center justify-between gap-2">
                              <span className="font-black text-slate-900">
                                Stop #{stop.stop_order}: {stop.bin_code}
                              </span>
                              <span
                                className={`px-1.5 py-0.2 rounded text-[10px] font-bold ${
                                  stop.stop_status === 'collected'
                                    ? 'bg-emerald-100 text-emerald-800'
                                    : 'bg-amber-100 text-amber-800'
                                }`}
                              >
                                {stop.stop_status}
                              </span>
                            </div>
                            <div className="text-slate-600 text-[11px]">
                              {stop.location_name}
                            </div>
                            <div className="pt-1 border-t border-slate-100 flex items-center justify-between text-[11px]">
                              <span className="text-slate-500">Current Fill:</span>
                              <span
                                className={`font-bold ${
                                  stop.current_fill_percent >= 80
                                    ? 'text-rose-600'
                                    : stop.current_fill_percent >= 50
                                    ? 'text-orange-600'
                                    : 'text-emerald-600'
                                }`}
                              >
                                {stop.current_fill_percent}% ({stop.capacity_liters}L)
                              </span>
                            </div>
                          </div>
                        </Popup>
                      </Marker>
                    ))}

                    {/* Polyline Path (Depot -> Stops -> Depot) */}
                    {polylineCoords.length > 1 && (
                      <Polyline
                        positions={polylineCoords}
                        pathOptions={{
                          color: '#0d9488',
                          weight: 4.5,
                          opacity: 0.85,
                          dashArray: '6, 8',
                          lineCap: 'round',
                          lineJoin: 'round'
                        }}
                      />
                    )}
                  </MapContainer>
                </div>
              </div>

              {/* Ordered Stop List Timeline */}
              <div className="bg-white rounded-2xl border border-slate-200/90 shadow-xs p-5 space-y-4">
                <div className="flex items-center justify-between">
                  <h4 className="text-xs font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                    <Navigation className="h-4 w-4 text-teal-600" />
                    Optimized Collection Itinerary & Bin Fill Status
                  </h4>
                  <span className="text-[11px] text-slate-500 font-medium">
                    Sequenced using 2-Opt Minimal Haversine Path
                  </span>
                </div>

                <div className="relative pl-6 space-y-4 before:absolute before:left-2.5 before:top-2 before:bottom-2 before:w-0.5 before:bg-slate-200">
                  {/* Origin: Depot */}
                  <div className="relative flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="absolute -left-[27px] w-5 h-5 rounded-full bg-amber-400 border-2 border-white shadow-xs flex items-center justify-center text-[10px] text-slate-900 font-bold">
                      ★
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Departure: {activeRouteDetail.depot?.name || 'Central Municipal Waste Depot'}
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {activeRouteDetail.depot?.address || 'Cubbon Park Central Zone, Bengaluru'}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-amber-700 bg-amber-100/70 px-2 py-0.5 rounded">
                      Origin
                    </span>
                  </div>

                  {/* Stops 1 to N */}
                  {activeRouteDetail.stops?.map((stop) => {
                    const isUrgent = stop.current_fill_percent >= 80;
                    return (
                      <div
                        key={stop.stop_id}
                        className={`relative flex flex-col sm:flex-row sm:items-center justify-between gap-3 p-3 rounded-xl border transition-colors ${
                          stop.stop_status === 'collected'
                            ? 'bg-slate-50/60 border-slate-200/60 opacity-80'
                            : isUrgent
                            ? 'bg-rose-50/30 border-rose-200'
                            : 'bg-white border-slate-200 hover:border-slate-300'
                        }`}
                      >
                        <div
                          className={`absolute -left-[27px] w-5 h-5 rounded-full border-2 border-white shadow-xs flex items-center justify-center text-[10px] font-bold text-white ${
                            stop.stop_status === 'collected'
                              ? 'bg-slate-500'
                              : isUrgent
                              ? 'bg-rose-500'
                              : stop.current_fill_percent >= 50
                              ? 'bg-orange-500'
                              : 'bg-emerald-500'
                          }`}
                        >
                          {stop.stop_status === 'collected' ? '✓' : stop.stop_order}
                        </div>

                        <div className="space-y-0.5">
                          <div className="flex items-center gap-2">
                            <span className="font-extrabold text-xs text-slate-900">
                              Stop #{stop.stop_order}: {stop.bin_code}
                            </span>
                            <span className="text-xs text-slate-400">•</span>
                            <span className="text-xs font-medium text-slate-700 truncate max-w-xs">
                              {stop.location_name}
                            </span>
                          </div>
                          <div className="text-[11px] text-slate-500">
                            Capacity: {stop.capacity_liters} Liters
                          </div>
                        </div>

                        {/* Fill Level Bar */}
                        <div className="flex items-center gap-3 w-full sm:w-56">
                          <div className="flex-1">
                            <div className="flex items-center justify-between text-[10px] font-semibold text-slate-600 mb-1">
                              <span>Fill Level</span>
                              <span
                                className={
                                  isUrgent
                                    ? 'text-rose-600 font-bold'
                                    : stop.current_fill_percent >= 50
                                    ? 'text-orange-600'
                                    : 'text-emerald-600'
                                }
                              >
                                {stop.current_fill_percent}%
                              </span>
                            </div>
                            <div className="w-full h-2 bg-slate-100 rounded-full overflow-hidden">
                              <div
                                className={`h-full transition-all duration-300 ${
                                  isUrgent
                                    ? 'bg-rose-500'
                                    : stop.current_fill_percent >= 50
                                    ? 'bg-orange-500'
                                    : 'bg-emerald-500'
                                }`}
                                style={{ width: `${Math.min(100, stop.current_fill_percent)}%` }}
                              ></div>
                            </div>
                          </div>

                          <span
                            className={`text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded ${
                              stop.stop_status === 'collected'
                                ? 'bg-emerald-100 text-emerald-800'
                                : 'bg-slate-100 text-slate-600'
                            }`}
                          >
                            {stop.stop_status}
                          </span>
                        </div>
                      </div>
                    );
                  })}

                  {/* Destination: Return to Depot */}
                  <div className="relative flex items-center justify-between gap-4 p-3 bg-slate-50 rounded-xl border border-slate-200/80">
                    <div className="absolute -left-[27px] w-5 h-5 rounded-full bg-amber-400 border-2 border-white shadow-xs flex items-center justify-center text-[10px] text-slate-900 font-bold">
                      ★
                    </div>
                    <div>
                      <div className="text-xs font-bold text-slate-900">
                        Arrival: Return to Depot (Discharge & Unload)
                      </div>
                      <div className="text-[11px] text-slate-500">
                        {activeRouteDetail.depot?.name || 'Central Municipal Waste Depot'}
                      </div>
                    </div>
                    <span className="text-[10px] font-bold text-teal-700 bg-teal-100/70 px-2 py-0.5 rounded">
                      Terminal
                    </span>
                  </div>
                </div>
              </div>
            </>
          )}
        </div>
      </div>

      {/* Manual Driver & Vehicle Assignment Modal */}
      {isAssignModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/60">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <User className="h-4 w-4 text-teal-600" />
                Assign Driver & Vehicle to Route
              </h3>
              <button
                type="button"
                onClick={() => setIsAssignModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1 rounded-lg"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleAssignSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assign Driver
                </label>
                <select
                  value={selectedDriverId}
                  onChange={(e) => setSelectedDriverId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">-- Leave Unassigned --</option>
                  {availableDrivers.map((d) => (
                    <option key={d.id} value={d.id}>
                      {d.name} ({d.phone || d.license_number})
                    </option>
                  ))}
                </select>
                {availableDrivers.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    No drivers currently marked as available.
                  </p>
                )}
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Assign Vehicle
                </label>
                <select
                  value={selectedVehicleId}
                  onChange={(e) => setSelectedVehicleId(e.target.value)}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">-- Leave Unassigned --</option>
                  {availableVehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.model} - {v.plate_number} ({v.avg_mileage_kmpl} km/L)
                    </option>
                  ))}
                </select>
                {availableVehicles.length === 0 && (
                  <p className="text-[11px] text-amber-600 mt-1">
                    No vehicles currently marked as available.
                  </p>
                )}
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsAssignModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={assigning}
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs flex items-center gap-1.5"
                >
                  {assigning ? (
                    <>
                      <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                      Saving...
                    </>
                  ) : (
                    'Confirm Assignment'
                  )}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
