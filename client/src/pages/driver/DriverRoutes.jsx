import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { apiFetch } from '../../api';
import { useSocket } from '../../context/SocketContext';
import { useAuth } from '../../context/AuthContext';
import useDriverLocationTracker from '../../hooks/useDriverLocationTracker';
import {
  Route as RouteIcon,
  Navigation,
  CheckCircle2,
  AlertTriangle,
  Play,
  Truck,
  Fuel,
  MapPin,
  Clock,
  Check,
  X,
  Layers,
  History,
  ShieldCheck,
  Flag,
  ArrowRight,
  Sparkles,
  RefreshCw,
  Gauge,
  Radio,
  Image as ImageIcon,
  AlertCircle
} from 'lucide-react';

// Custom Map Bounds Auto-Fitter
function MapBoundsFitter({ bounds }) {
  const map = useMap();
  useEffect(() => {
    if (bounds && bounds.length > 0) {
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15, animate: true });
    }
  }, [bounds, map]);
  return null;
}

// Depot Icon
const createDepotIcon = () => {
  return L.divIcon({
    className: 'custom-depot-icon',
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        <div style="position: relative; width: 32px; height: 32px; border-radius: 50%; background: linear-gradient(135deg, #1e293b, #0f172a); border: 2.5px solid #eab308; box-shadow: 0 4px 10px rgba(0,0,0,0.4); display: flex; align-items: center; justify-content: center; color: #eab308;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#facc15" stroke-width="2.5" stroke-linecap="round" stroke-linejoin="round">
            <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z"/>
            <polyline points="9 22 9 12 15 12 15 22"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
};

// Driver Stop Marker
const createDriverStopIcon = (stopNumber, status, fillPercent) => {
  let bgColor = '#10b981'; // Green
  let text = stopNumber;

  if (status === 'collected') {
    bgColor = '#059669';
    text = '✓';
  } else if (status === 'skipped') {
    bgColor = '#64748b';
    text = '✕';
  } else if (fillPercent >= 80) {
    bgColor = '#ef4444';
  } else if (fillPercent >= 50) {
    bgColor = '#f97316';
  }

  return L.divIcon({
    className: 'custom-driver-stop',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        ${status === 'pending' && fillPercent >= 80 ? `<div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background-color: rgba(239, 68, 68, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
        <div style="position: relative; width: 30px; height: 30px; border-radius: 50%; background-color: ${bgColor}; border: 2px solid #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 11px; font-weight: 800; font-family: sans-serif;">
          ${text}
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

export default function DriverRoutes() {
  const { user } = useAuth();
  const { socket } = useSocket();

  // Activate background 30s geolocation tracker with silent fallback
  useDriverLocationTracker();

  const [activeData, setActiveData] = useState(null);
  const [history, setHistory] = useState([]);
  const [loading, setLoading] = useState(true);
  const [actionLoading, setActionLoading] = useState(false);
  const [toast, setToast] = useState(null);

  // Skip Modal state (supports both standalone collection requests and route stops)
  const [skipModalTarget, setSkipModalTarget] = useState(null); // { type: 'task' | 'stop', id: number, label: string }
  const [skipReason, setSkipReason] = useState('Road blocked / Inaccessible');
  const [customSkipReason, setCustomSkipReason] = useState('');

  // Fuel Complete Modal state
  const [isCompleteModalOpen, setIsCompleteModalOpen] = useState(false);
  const [fuelLiters, setFuelLiters] = useState('');
  const [odometerKm, setOdometerKm] = useState('');
  const [fuelCost, setFuelCost] = useState('');

  // Fetch active route and assigned standalone tasks
  const fetchActiveData = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/driver/active-route');
      if (res.ok) {
        const data = await res.json();
        setActiveData(data);

        // Pre-fill fuel suggestions if route exists
        if (data.hasActiveRoute && data.route) {
          const estFuel = data.route.estimated_fuel_liters || 8.0;
          setFuelLiters(String(estFuel));
          setFuelCost(String(Math.round(estFuel * 94.5)));
          setOdometerKm('14250');
        }
      }

      // Also fetch history
      const histRes = await apiFetch('/api/driver/routes/history');
      if (histRes.ok) {
        const histData = await histRes.json();
        setHistory(histData);
      }
    } catch (err) {
      console.error('Failed to load driver tasks:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchActiveData();
  }, []);

  // Socket.IO real-time event listeners
  useEffect(() => {
    if (!socket) return;

    const handleDataUpdate = () => {
      fetchActiveData();
    };

    socket.on('route:created', handleDataUpdate);
    socket.on('route:updated', handleDataUpdate);
    socket.on('request:created', handleDataUpdate);
    socket.on('request:updated', handleDataUpdate);
    socket.on('requests:updated', handleDataUpdate);
    socket.on('notification:new', handleDataUpdate);

    return () => {
      socket.off('route:created', handleDataUpdate);
      socket.off('route:updated', handleDataUpdate);
      socket.off('request:created', handleDataUpdate);
      socket.off('request:updated', handleDataUpdate);
      socket.off('requests:updated', handleDataUpdate);
      socket.off('notification:new', handleDataUpdate);
    };
  }, [socket]);

  // Start Route handler
  const handleStartRoute = async () => {
    if (!activeData?.route?.id) return;
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/driver/routes/${activeData.route.id}/start`, {
        method: 'PUT'
      });
      const data = await res.json();
      if (res.ok) {
        setToast({ type: 'success', message: 'Route started! Drive safely.' });
        fetchActiveData();
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to start route' });
      }
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', message: 'Error starting route' });
    } finally {
      setActionLoading(false);
    }
  };

  // Collect Stop in Route handler
  const handleCollectStop = async (stopId, binCode) => {
    if (!activeData?.route?.id) return;
    try {
      setActionLoading(true);
      const res = await apiFetch(
        `/api/driver/routes/${activeData.route.id}/stops/${stopId}`,
        {
          method: 'PUT',
          body: JSON.stringify({ action: 'collect' })
        }
      );
      const data = await res.json();
      if (res.ok) {
        setToast({
          type: 'success',
          message: `Bin ${binCode} marked collected! Fill level reset to 5%.`
        });
        fetchActiveData();
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to collect stop' });
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Standalone Collection Request "Mark Collected" handler
  const handleCollectTask = async (taskId, binCode) => {
    try {
      setActionLoading(true);
      const res = await apiFetch(`/api/driver/tasks/${taskId}/collect`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok) {
        setToast({
          type: 'success',
          message: data.message || `Bin ${binCode} collected and emptied!`
        });
        fetchActiveData();
      } else {
        setToast({ type: 'error', message: data.error || 'Failed to mark task collected' });
      }
    } catch (err) {
      console.error(err);
      setToast({ type: 'error', message: 'Error collecting task: ' + err.message });
    } finally {
      setActionLoading(false);
    }
  };

  // Skip Modal Submit handler (handles both Task and Stop)
  const handleSkipSubmit = async (e) => {
    e.preventDefault();
    if (!skipModalTarget) return;

    const reason = skipReason === 'Other' ? customSkipReason : skipReason;

    try {
      setActionLoading(true);
      let res;
      if (skipModalTarget.type === 'stop') {
        res = await apiFetch(
          `/api/driver/routes/${activeData.route.id}/stops/${skipModalTarget.id}`,
          {
            method: 'PUT',
            body: JSON.stringify({ action: 'skip', skip_reason: reason })
          }
        );
      } else {
        res = await apiFetch(`/api/driver/tasks/${skipModalTarget.id}/skip`, {
          method: 'POST',
          body: JSON.stringify({ skip_reason: reason })
        });
      }

      if (res.ok) {
        setToast({
          type: 'warning',
          message: `${skipModalTarget.label} marked as skipped.`
        });
        setSkipModalTarget(null);
        fetchActiveData();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to skip');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Complete Route submit handler
  const handleCompleteSubmit = async (e) => {
    e.preventDefault();
    if (!activeData?.route?.id) return;

    try {
      setActionLoading(true);
      const res = await apiFetch(
        `/api/driver/routes/${activeData.route.id}/complete`,
        {
          method: 'POST',
          body: JSON.stringify({
            liters_filled: Number(fuelLiters),
            odometer_km: Number(odometerKm),
            cost: Number(fuelCost)
          })
        }
      );
      const data = await res.json();
      if (res.ok) {
        setIsCompleteModalOpen(false);
        setToast({
          type: 'success',
          message: 'Route completed and fuel logged successfully! You are now available for dispatch.'
        });
        fetchActiveData();
      } else {
        alert(data.error || 'Failed to complete route');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setActionLoading(false);
    }
  };

  // Map Coordinates & Bounds
  const { polylineCoords, mapBounds, depotCoord } = useMemo(() => {
    const points = [];
    const depot = activeData?.route?.depot || { latitude: 12.9716, longitude: 77.5946 };
    const depotPair = [depot.latitude, depot.longitude];

    if (activeData?.hasActiveRoute && activeData?.route?.stops) {
      points.push(depotPair);
      activeData.route.stops.forEach((s) => {
        if (s.latitude && s.longitude) points.push([s.latitude, s.longitude]);
      });
      points.push(depotPair);
    }

    // Also include coordinates of standalone assigned tasks
    if (activeData?.assignedTasks && activeData.assignedTasks.length > 0) {
      activeData.assignedTasks.forEach((t) => {
        if (t.latitude && t.longitude) points.push([t.latitude, t.longitude]);
      });
    }

    return {
      polylineCoords: activeData?.hasActiveRoute ? points : [],
      mapBounds: points.length > 0 ? points : [depotPair],
      depotCoord: depotPair
    };
  }, [activeData]);

  const assignedTasks = activeData?.assignedTasks || [];
  const route = activeData?.route;
  const stops = route?.stops || [];
  const isStarted = route?.status === 'in_progress';
  const pendingStopsCount = stops.filter((s) => s.stop_status === 'pending').length;
  const collectedStopsCount = stops.filter((s) => s.stop_status === 'collected').length;
  const skippedStopsCount = stops.filter((s) => s.stop_status === 'skipped').length;
  const progressPercent = stops.length > 0 ? Math.round(((collectedStopsCount + skippedStopsCount) / stops.length) * 100) : 0;

  const hasAnyTasks = assignedTasks.length > 0 || !!activeData?.hasActiveRoute;

  return (
    <div className="space-y-5 max-w-xl mx-auto md:max-w-4xl pb-16 px-3 sm:px-4 w-full overflow-x-hidden font-sans">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-3.5 sm:p-4 rounded-2xl text-xs sm:text-sm font-semibold flex items-center justify-between border shadow-md animate-in fade-in duration-200 ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-900 border-emerald-300'
              : toast.type === 'warning'
              ? 'bg-amber-50 text-amber-900 border-amber-300'
              : 'bg-rose-50 text-rose-900 border-rose-300'
          }`}
        >
          <div className="flex items-center gap-2.5">
            {toast.type === 'success' && <CheckCircle2 className="h-5 w-5 text-emerald-600 shrink-0" />}
            {toast.type === 'warning' && <AlertTriangle className="h-5 w-5 text-amber-600 shrink-0" />}
            {toast.type === 'error' && <AlertCircle className="h-5 w-5 text-rose-600 shrink-0" />}
            <span className="leading-snug">{toast.message}</span>
          </div>
          <button
            onClick={() => setToast(null)}
            className="p-1.5 text-slate-400 hover:text-slate-700 min-h-[44px] min-w-[44px] flex items-center justify-center rounded-lg"
          >
            <X className="h-5 w-5" />
          </button>
        </div>
      )}

      {/* Driver Header Card (Optimized for Mobile) */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-4 sm:p-6 rounded-3xl shadow-xl border border-slate-800 text-white flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div className="flex items-center gap-3.5">
          <div className="h-12 w-12 sm:h-14 sm:w-14 rounded-2xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400 text-xl font-black shrink-0 shadow-xs">
            {user?.name ? user.name[0] : 'D'}
          </div>
          <div className="min-w-0">
            <div className="flex items-center gap-2 flex-wrap">
              <h1 className="text-base sm:text-lg font-black text-white truncate">{user?.name}</h1>
              <span className="text-[10px] font-extrabold uppercase tracking-wider px-2.5 py-0.5 rounded-full bg-emerald-500/20 text-emerald-300 border border-emerald-500/30">
                Driver Portal
              </span>
            </div>
            <p className="text-xs text-slate-300 mt-1 flex items-center gap-1.5 truncate">
              <Truck className="h-3.5 w-3.5 text-teal-400 shrink-0" />
              <span className="truncate">
                {activeData?.driver?.vehicle_plate || 'Fleet Truck'} • GPS Active
              </span>
            </p>
          </div>
        </div>

        <div className="flex items-center justify-between sm:justify-end gap-3 pt-2 sm:pt-0 border-t sm:border-t-0 border-slate-700/60">
          <div className="text-left sm:text-right">
            <div className="text-[10px] text-slate-400 uppercase font-bold tracking-wider">Duty Status</div>
            <div className="text-xs sm:text-sm font-extrabold text-teal-400">
              {activeData?.driver?.availability === 'busy' ? 'Busy on Task' : 'Available for Dispatch'}
            </div>
          </div>
          <button
            type="button"
            onClick={fetchActiveData}
            disabled={loading}
            className="p-2 sm:p-2.5 rounded-xl bg-slate-800 hover:bg-slate-700 border border-slate-700 text-teal-400 min-h-[44px] min-w-[44px] flex items-center justify-center transition-colors active:scale-95"
            title="Refresh Tasks"
          >
            <RefreshCw className={`h-4 w-4 ${loading ? 'animate-spin' : ''}`} />
          </button>
        </div>
      </div>

      {loading ? (
        <div className="bg-white rounded-3xl border border-slate-200 p-10 text-center text-xs text-slate-400 space-y-2 shadow-xs">
          <div className="w-7 h-7 border-3 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto"></div>
          <div>Syncing tasks and dispatch coordinates...</div>
        </div>
      ) : !hasAnyTasks ? (
        /* No Active Tasks or Route State */
        <div className="space-y-5">
          <div className="bg-white rounded-3xl border border-slate-200 p-8 sm:p-12 text-center space-y-4 shadow-xs">
            <div className="h-16 w-16 rounded-full bg-emerald-50 text-emerald-600 mx-auto flex items-center justify-center">
              <CheckCircle2 className="h-9 w-9" />
            </div>
            <div className="max-w-md mx-auto space-y-1.5">
              <h2 className="text-base sm:text-lg font-black text-slate-900">
                All Caught Up! No Pending Tasks
              </h2>
              <p className="text-xs sm:text-sm text-slate-500 leading-relaxed">
                You are currently marked as <strong className="text-emerald-700">Available</strong>. When dispatch assigns an urgent bin collection task or route, it will appear here immediately with live alerts.
              </p>
            </div>
          </div>

          {/* History */}
          {history.length > 0 && (
            <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-3.5">
              <h3 className="text-xs sm:text-sm font-bold uppercase tracking-wider text-slate-800 flex items-center gap-2">
                <History className="h-4 w-4 text-teal-600" />
                Recent Route History
              </h3>
              <div className="divide-y divide-slate-100">
                {history.map((h) => (
                  <div key={h.id} className="py-3 flex flex-col sm:flex-row sm:items-center justify-between gap-2 text-xs">
                    <div>
                      <div className="font-bold text-slate-800 text-sm">{h.name}</div>
                      <div className="text-[11px] text-slate-400 mt-0.5">
                        {new Date(h.completed_at || h.created_at).toLocaleDateString()} • {h.total_distance_km} km • {h.total_stops} stops
                      </div>
                    </div>
                    <span className="font-semibold text-emerald-700 bg-emerald-50 px-2.5 py-1 rounded-lg text-xs font-mono self-start sm:self-auto">
                      {h.liters_filled ? `${h.liters_filled} L fuel logged` : 'Completed'}
                    </span>
                  </div>
                ))}
              </div>
            </div>
          )}
        </div>
      ) : (
        /* Active Tasks / Route Layout */
        <div className="space-y-6">
          {/* SECTION 1: Direct Assigned Collection Tasks (Mobile Single Column) */}
          {assignedTasks.length > 0 && (
            <div className="space-y-3">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <Truck className="h-5 w-5 text-blue-600" />
                  Assigned Collection Tasks ({assignedTasks.length})
                </h2>
                <span className="text-xs font-bold text-blue-700 bg-blue-50 px-2.5 py-0.5 rounded-full border border-blue-200">
                  Priority Queue
                </span>
              </div>

              <div className="space-y-3.5">
                {assignedTasks.map((task) => {
                  const isUrgent = task.priority === 'urgent' || task.current_fill_percent >= 80;
                  return (
                    <div
                      key={task.id}
                      className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-sm space-y-3.5 transition-all hover:border-slate-300"
                    >
                      {/* Task Header */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="space-y-1">
                          <div className="flex items-center gap-2 flex-wrap">
                            <span className="font-black text-sm sm:text-base text-slate-900">
                              Bin {task.bin_code}
                            </span>
                            <span
                              className={`text-[10px] sm:text-xs font-extrabold px-2.5 py-0.5 rounded-full uppercase border ${
                                task.priority === 'urgent'
                                  ? 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse'
                                  : task.priority === 'high'
                                  ? 'bg-amber-100 text-amber-800 border-amber-300'
                                  : 'bg-blue-100 text-blue-800 border-blue-300'
                              }`}
                            >
                              {task.priority}
                            </span>
                            <span className="text-[10px] font-bold px-2 py-0.5 rounded-full bg-slate-100 text-slate-600 border border-slate-200 capitalize">
                              Source: {task.source}
                            </span>
                          </div>
                          <p className="text-xs sm:text-sm text-slate-600 flex items-center gap-1.5 font-medium">
                            <MapPin className="h-4 w-4 text-slate-400 shrink-0" />
                            {task.location_name}
                          </p>
                        </div>

                        <div className="text-right shrink-0">
                          <span
                            className={`text-sm sm:text-base font-black ${
                              isUrgent ? 'text-rose-600' : 'text-amber-600'
                            }`}
                          >
                            {task.current_fill_percent}%
                          </span>
                          <div className="text-[10px] text-slate-400 font-semibold uppercase">Fill Level</div>
                        </div>
                      </div>

                      {/* Complaint Photo if applicable */}
                      {task.complaint_photo && (
                        <div className="p-2.5 bg-slate-50 rounded-2xl border border-slate-200 flex items-center gap-3">
                          <img
                            src={task.complaint_photo}
                            alt="Complaint evidence"
                            className="w-14 h-14 rounded-xl object-cover border border-slate-200 shrink-0"
                          />
                          <div className="text-xs min-w-0">
                            <div className="font-bold text-slate-800 flex items-center gap-1">
                              <ImageIcon className="w-3.5 h-3.5 text-blue-600 shrink-0" />
                              Citizen Complaint Photo
                            </div>
                            <p className="text-[11px] text-slate-500 truncate mt-0.5">
                              {task.complaint_description || 'Overflowing bin evidence'}
                            </p>
                          </div>
                        </div>
                      )}

                      {/* Large Tap Action Buttons for Phone (Requirement 1 & 5) */}
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-2.5 pt-1">
                        <button
                          type="button"
                          onClick={() =>
                            setSkipModalTarget({
                              type: 'task',
                              id: task.id,
                              label: `Task #${task.id} (${task.bin_code})`
                            })
                          }
                          disabled={actionLoading}
                          className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-bold border-2 border-slate-200 hover:bg-slate-100 text-slate-700 active:scale-[0.98] transition-all flex items-center justify-center gap-2"
                        >
                          <X className="h-4 w-4 text-slate-400" />
                          Skip
                        </button>

                        <button
                          type="button"
                          onClick={() => handleCollectTask(task.id, task.bin_code)}
                          disabled={actionLoading}
                          className="w-full min-h-[48px] py-3.5 px-4 rounded-2xl text-xs sm:text-sm font-black bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98] transition-all flex items-center justify-center gap-2 shadow-sm"
                        >
                          <Check className="h-4 w-4 stroke-[3]" />
                          Mark Collected
                        </button>
                      </div>
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* SECTION 2: Active Route (if driver has route assigned) */}
          {activeData?.hasActiveRoute && route && (
            <div className="space-y-4 pt-2">
              <div className="flex items-center justify-between px-1">
                <h2 className="text-sm sm:text-base font-extrabold text-slate-900 flex items-center gap-2">
                  <RouteIcon className="h-5 w-5 text-teal-600" />
                  Active Collection Route
                </h2>
                <span className="text-xs font-bold text-teal-700 bg-teal-50 px-2.5 py-0.5 rounded-full border border-teal-200">
                  {route.total_stops} Stops
                </span>
              </div>

              {/* Route Control Banner */}
              <div className="bg-white rounded-3xl border border-slate-200 p-4 sm:p-5 shadow-xs space-y-4">
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                  <div>
                    <h3 className="text-sm sm:text-base font-black text-slate-900">{route.name}</h3>
                    <p className="text-xs text-slate-500 mt-0.5 flex items-center gap-2">
                      <Navigation className="h-3.5 w-3.5 text-teal-600" />
                      {route.total_distance_km} km loop • Est. {route.estimated_fuel_liters || 8}L fuel
                    </p>
                  </div>

                  {!isStarted ? (
                    <button
                      type="button"
                      onClick={handleStartRoute}
                      disabled={actionLoading}
                      className="w-full sm:w-auto min-h-[48px] py-3 px-6 rounded-2xl bg-teal-600 hover:bg-teal-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all"
                    >
                      <Play className="h-4 w-4 fill-white" />
                      Start Route Navigation
                    </button>
                  ) : pendingStopsCount === 0 ? (
                    <button
                      type="button"
                      onClick={() => setIsCompleteModalOpen(true)}
                      className="w-full sm:w-auto min-h-[48px] py-3 px-6 rounded-2xl bg-emerald-600 hover:bg-emerald-700 text-white text-xs sm:text-sm font-bold flex items-center justify-center gap-2 shadow-sm active:scale-[0.98] transition-all"
                    >
                      <Flag className="h-4 w-4" />
                      Complete Route & Log Fuel
                    </button>
                  ) : (
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-amber-700 bg-amber-50 px-3 py-1.5 rounded-xl border border-amber-200 animate-pulse">
                        In Progress ({collectedStopsCount + skippedStopsCount}/{stops.length})
                      </span>
                    </div>
                  )}
                </div>

                {/* Progress Bar */}
                <div className="space-y-1.5">
                  <div className="flex justify-between text-xs font-semibold text-slate-600">
                    <span>Progress: {progressPercent}%</span>
                    <span>{collectedStopsCount} collected, {skippedStopsCount} skipped</span>
                  </div>
                  <div className="w-full bg-slate-100 rounded-full h-2.5 overflow-hidden border">
                    <div
                      className="h-full bg-gradient-to-r from-teal-500 to-emerald-500 transition-all duration-300"
                      style={{ width: `${progressPercent}%` }}
                    ></div>
                  </div>
                </div>
              </div>

              {/* Stops List */}
              <div className="space-y-3">
                {stops.map((stop) => {
                  const isCollected = stop.stop_status === 'collected';
                  const isSkipped = stop.stop_status === 'skipped';
                  const isPending = stop.stop_status === 'pending';
                  const isUrgent = stop.current_fill_percent >= 80;

                  return (
                    <div
                      key={stop.stop_id}
                      className={`rounded-3xl border p-4 sm:p-5 transition-all space-y-3 ${
                        isCollected
                          ? 'bg-slate-50/70 border-slate-200/70 opacity-90'
                          : isSkipped
                          ? 'bg-amber-50/40 border-amber-200/60'
                          : isUrgent
                          ? 'bg-rose-50/20 border-rose-300 shadow-xs'
                          : 'bg-white border-slate-200 shadow-xs'
                      }`}
                    >
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-start gap-3 min-w-0">
                          <div
                            className={`h-9 w-9 rounded-xl flex items-center justify-center font-black text-xs sm:text-sm shrink-0 ${
                              isCollected
                                ? 'bg-emerald-100 text-emerald-700'
                                : isSkipped
                                ? 'bg-slate-200 text-slate-700'
                                : isUrgent
                                ? 'bg-rose-500 text-white'
                                : 'bg-teal-600 text-white'
                            }`}
                          >
                            {isCollected ? <Check className="h-5 w-5" /> : stop.stop_order}
                          </div>
                          <div className="min-w-0">
                            <div className="font-extrabold text-sm text-slate-900 truncate">
                              {stop.bin_code}
                            </div>
                            <div className="text-xs text-slate-600 truncate">{stop.location_name}</div>
                            <div className="text-[11px] text-slate-500 mt-1">
                              Fill Level: <strong className={isUrgent ? 'text-rose-600' : 'text-slate-800'}>{stop.current_fill_percent}%</strong>
                              {isSkipped && stop.skip_reason && (
                                <span className="block text-amber-700 font-semibold mt-0.5">
                                  Skipped: {stop.skip_reason}
                                </span>
                              )}
                            </div>
                          </div>
                        </div>

                        <div className="shrink-0">
                          {isCollected ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-emerald-100 text-emerald-800 text-[11px] font-extrabold">
                              <CheckCircle2 className="h-3.5 w-3.5" />
                              Collected
                            </span>
                          ) : isSkipped ? (
                            <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full bg-slate-200 text-slate-700 text-[11px] font-extrabold">
                              Skipped
                            </span>
                          ) : (
                            <span className="text-[11px] font-bold text-slate-400 bg-slate-100 px-2 py-0.5 rounded-full">
                              Pending
                            </span>
                          )}
                        </div>
                      </div>

                      {/* Route Stop Action Buttons */}
                      {isPending && (
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-2 pt-1 border-t border-slate-100">
                          <button
                            type="button"
                            onClick={() =>
                              setSkipModalTarget({
                                type: 'stop',
                                id: stop.stop_id,
                                label: `Stop #${stop.stop_order} (${stop.bin_code})`
                              })
                            }
                            disabled={!isStarted || actionLoading}
                            className={`min-h-[48px] py-3 px-4 rounded-2xl text-xs sm:text-sm font-bold border-2 transition-all flex items-center justify-center gap-1.5 ${
                              !isStarted
                                ? 'border-slate-200 text-slate-300 cursor-not-allowed'
                                : 'border-slate-200 hover:bg-slate-100 text-slate-700 active:scale-[0.98]'
                            }`}
                          >
                            <X className="h-4 w-4" />
                            Skip
                          </button>

                          <button
                            type="button"
                            onClick={() => handleCollectStop(stop.stop_id, stop.bin_code)}
                            disabled={!isStarted || actionLoading}
                            className={`min-h-[48px] py-3 px-4 rounded-2xl text-xs sm:text-sm font-black transition-all flex items-center justify-center gap-1.5 shadow-sm ${
                              !isStarted
                                ? 'bg-slate-200 text-slate-400 cursor-not-allowed'
                                : 'bg-emerald-600 hover:bg-emerald-700 text-white active:scale-[0.98]'
                            }`}
                          >
                            <Check className="h-4 w-4 stroke-[3]" />
                            Mark Collected
                          </button>
                        </div>
                      )}
                    </div>
                  );
                })}
              </div>
            </div>
          )}

          {/* Interactive Route / Task Map */}
          <div className="rounded-3xl overflow-hidden border border-slate-200 shadow-sm bg-white space-y-2 p-3 sm:p-4">
            <div className="flex items-center justify-between text-xs font-bold text-slate-800 px-1">
              <span className="flex items-center gap-1.5">
                <Navigation className="h-4 w-4 text-teal-600" />
                Live Map View
              </span>
              <span className="text-[10px] text-slate-400 font-normal">Auto-centered</span>
            </div>
            <div className="h-60 sm:h-80 w-full rounded-2xl overflow-hidden border border-slate-100">
              <MapContainer
                center={depotCoord}
                zoom={12}
                style={{ height: '100%', width: '100%' }}
                zoomControl={false}
              >
                <TileLayer url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png" />
                <MapBoundsFitter bounds={mapBounds} />

                {/* Depot Marker */}
                <Marker position={depotCoord} icon={createDepotIcon()}>
                  <Popup>
                    <div className="text-xs">
                      <b>Central Depot</b>
                      <br />
                      Base Station & Disposal Terminal
                    </div>
                  </Popup>
                </Marker>

                {/* Stops Markers */}
                {stops.map((stop) => (
                  <Marker
                    key={stop.stop_id}
                    position={[stop.latitude, stop.longitude]}
                    icon={createDriverStopIcon(
                      stop.stop_order,
                      stop.stop_status,
                      stop.current_fill_percent
                    )}
                  >
                    <Popup>
                      <div className="text-xs space-y-1">
                        <b>Stop #{stop.stop_order}: {stop.bin_code}</b>
                        <div>{stop.location_name}</div>
                        <div>Status: {stop.stop_status}</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {/* Assigned Standalone Tasks Markers */}
                {assignedTasks.map((t) => (
                  <Marker
                    key={`task-${t.id}`}
                    position={[t.latitude, t.longitude]}
                    icon={createDriverStopIcon('!', t.request_status, t.current_fill_percent)}
                  >
                    <Popup>
                      <div className="text-xs space-y-1">
                        <b>Task #{t.id}: {t.bin_code}</b>
                        <div>{t.location_name}</div>
                        <div>Fill: {t.current_fill_percent}%</div>
                      </div>
                    </Popup>
                  </Marker>
                ))}

                {polylineCoords.length > 1 && (
                  <Polyline
                    positions={polylineCoords}
                    pathOptions={{ color: '#0d9488', weight: 4, opacity: 0.85, dashArray: '6, 6' }}
                  />
                )}
              </MapContainer>
            </div>
          </div>
        </div>
      )}

      {/* Skip Modal (Accessible with Large Tap Options) */}
      {skipModalTarget && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-md w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-200 max-h-[90vh] overflow-y-auto">
            <div className="flex items-center justify-between border-b pb-3">
              <div>
                <h3 className="text-base font-extrabold text-slate-900">Skip Collection</h3>
                <p className="text-xs text-slate-500">{skipModalTarget.label}</p>
              </div>
              <button
                onClick={() => setSkipModalTarget(null)}
                className="p-2 text-slate-400 hover:text-slate-600 rounded-lg min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleSkipSubmit} className="space-y-4">
              <div className="space-y-2">
                <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
                  Select Reason
                </label>
                <div className="space-y-2">
                  {[
                    'Road blocked / Inaccessible',
                    'Bin not found / Relocated',
                    'Contaminated / Hazardous waste',
                    'Heavy overflow / Requires crane',
                    'Other'
                  ].map((r) => (
                    <label
                      key={r}
                      className={`flex items-center gap-3 p-3 rounded-2xl border cursor-pointer transition-all min-h-[48px] ${
                        skipReason === r
                          ? 'border-teal-500 bg-teal-50/50 ring-1 ring-teal-500/20'
                          : 'border-slate-200 hover:bg-slate-50'
                      }`}
                    >
                      <input
                        type="radio"
                        name="skipReason"
                        value={r}
                        checked={skipReason === r}
                        onChange={(e) => setSkipReason(e.target.value)}
                        className="w-4 h-4 text-teal-600 focus:ring-teal-500"
                      />
                      <span className="text-xs sm:text-sm font-semibold text-slate-800">{r}</span>
                    </label>
                  ))}
                </div>
              </div>

              {skipReason === 'Other' && (
                <div>
                  <label className="block text-xs font-semibold text-slate-600 mb-1">
                    Describe short reason
                  </label>
                  <input
                    type="text"
                    value={customSkipReason}
                    onChange={(e) => setCustomSkipReason(e.target.value)}
                    placeholder="Enter short description..."
                    required
                    className="w-full px-3.5 py-3 border border-slate-300 rounded-xl text-xs sm:text-sm bg-slate-50 focus:bg-white outline-none"
                  />
                </div>
              )}

              <div className="grid grid-cols-2 gap-2.5 pt-2">
                <button
                  type="button"
                  onClick={() => setSkipModalTarget(null)}
                  className="min-h-[48px] py-3 px-4 rounded-xl border border-slate-200 text-xs sm:text-sm font-bold text-slate-600 hover:bg-slate-100"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="min-h-[48px] py-3 px-4 rounded-xl bg-amber-600 hover:bg-amber-700 text-white text-xs sm:text-sm font-bold shadow-sm"
                >
                  Confirm Skip
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Complete Route & Log Fuel Modal */}
      {isCompleteModalOpen && (
        <div className="fixed inset-0 z-[9999] bg-slate-900/70 backdrop-blur-xs flex items-end sm:items-center justify-center p-3 sm:p-4 animate-in fade-in duration-150">
          <div className="bg-white rounded-t-3xl sm:rounded-3xl max-w-sm w-full p-5 sm:p-6 shadow-2xl space-y-4 border border-slate-200">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-extrabold text-slate-900 flex items-center gap-2">
                <Fuel className="h-5 w-5 text-teal-600" />
                Complete Route
              </h3>
              <button
                onClick={() => setIsCompleteModalOpen(false)}
                className="p-1.5 text-slate-400 hover:text-slate-600 min-h-[44px] min-w-[44px] flex items-center justify-center"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCompleteSubmit} className="space-y-3.5 text-xs sm:text-sm">
              <div>
                <label className="block font-bold text-slate-700 mb-1">Fuel Filled (Liters)</label>
                <input
                  type="number"
                  step="0.1"
                  value={fuelLiters}
                  onChange={(e) => {
                    setFuelLiters(e.target.value);
                    setFuelCost(String(Math.round(Number(e.target.value) * 94.5)));
                  }}
                  required
                  className="w-full px-3.5 py-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none text-sm font-bold"
                />
              </div>

              <div>
                <label className="block font-bold text-slate-700 mb-1">Current Odometer (km)</label>
                <input
                  type="number"
                  value={odometerKm}
                  onChange={(e) => setOdometerKm(e.target.value)}
                  required
                  className="w-full px-3.5 py-3 border border-slate-300 rounded-xl bg-slate-50 focus:bg-white outline-none text-sm font-bold"
                />
              </div>

              <div className="grid grid-cols-2 gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsCompleteModalOpen(false)}
                  className="min-h-[48px] py-3 px-4 rounded-xl border border-slate-200 font-bold text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={actionLoading}
                  className="min-h-[48px] py-3 px-4 rounded-xl bg-emerald-600 hover:bg-emerald-700 text-white font-black shadow-sm"
                >
                  Finish Route
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
