import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { apiFetch } from '../api';
import { useSocket } from '../context/SocketContext';
import AssignDriverModal from '../components/AssignDriverModal';
import AddDriverModal from '../components/AddDriverModal';
import {
  AlertTriangle,
  Clock,
  Truck,
  MessageSquareWarning,
  CheckCircle2,
  Phone,
  Layers,
  ArrowRight,
  ShieldCheck,
  UserCheck,
  Radio,
  Wifi,
  Navigation,
  Image as ImageIcon,
  MapPin,
  ExternalLink,
  Check,
  RefreshCw,
  X,
  Sparkles,
  Zap,
  Activity,
  Flame,
  User,
  UserPlus
} from 'lucide-react';

// Distance calculation helper (Haversine)
function getDistanceKm(lat1, lon1, lat2, lon2) {
  if (!lat1 || !lon1 || !lat2 || !lon2) return null;
  const R = 6371;
  const dLat = ((lat2 - lat1) * Math.PI) / 180;
  const dLon = ((lon2 - lon1) * Math.PI) / 180;
  const a =
    Math.sin(dLat / 2) * Math.sin(dLat / 2) +
    Math.cos((lat1 * Math.PI) / 180) * Math.cos((lat2 * Math.PI) / 180) *
    Math.sin(dLon / 2) * Math.sin(dLon / 2);
  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));
  return Math.round(R * c * 10) / 10;
}

// Marker Icon for Complaint / Critical Bins
const createBinMarkerIcon = (fillPercent, isSelected) => {
  const color = fillPercent >= 80 ? '#ef4444' : fillPercent >= 50 ? '#f97316' : '#10b981';
  const size = isSelected ? 42 : 34;
  const border = isSelected ? '3px solid #0f172a' : '2px solid #ffffff';

  return L.divIcon({
    className: 'custom-dashboard-bin-icon',
    html: `
      <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: ${size + 8}px; height: ${size + 8}px; border-radius: 50%; background-color: ${color}; opacity: 0.35; animation: ping 1.4s infinite;"></div>
        <div style="position: relative; width: ${size}px; height: ${size}px; border-radius: 50%; background-color: ${color}; border: ${border}; box-shadow: 0 6px 14px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: ${isSelected ? '13px' : '11px'}; font-weight: 900;">
          ${fillPercent || 80}%
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

// Marker Icon for Driver Trucks
const createDriverTruckIcon = (availability, isNearest) => {
  let bgColor = '#2563eb'; // blue
  if (availability === 'busy') bgColor = '#f97316'; // orange
  else if (availability === 'off_duty') bgColor = '#64748b'; // grey
  if (isNearest) bgColor = '#0284c7'; // cyan highlight

  const size = isNearest ? 42 : 34;

  return L.divIcon({
    className: 'custom-driver-truck-icon',
    html: `
      <div style="position: relative; width: ${size}px; height: ${size}px; display: flex; align-items: center; justify-content: center;">
        ${isNearest ? '<div style="position: absolute; width: ${size + 10}px; height: ${size + 10}px; border-radius: 50%; background-color: rgba(2, 132, 199, 0.45); animation: pulse 1.5s infinite;"></div>' : ''}
        <div style="position: relative; width: ${size}px; height: ${size}px; border-radius: 50%; background-color: ${bgColor}; border: 2.5px solid #ffffff; box-shadow: 0 6px 14px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff;">
          <svg xmlns="http://www.w3.org/2000/svg" width="18" height="18" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
            <path d="M15 18H9"/>
            <path d="M19 18h2a1 1 0 0 0 1-1v-5l-3-4h-5v10Z"/>
            <circle cx="7" cy="18" r="2"/>
            <circle cx="17" cy="18" r="2"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [size, size],
    iconAnchor: [size / 2, size / 2],
    popupAnchor: [0, -size / 2]
  });
};

// Auto-pan map when selected complaint changes
function MapViewHandler({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center && center[0] && center[1]) {
      map.setView(center, 13, { animate: true });
    }
  }, [center, map]);
  return null;
}

export default function Dashboard() {
  const { socket, isConnected } = useSocket();

  // Active view tab in Action Hub
  const [activeTab, setActiveTab] = useState('complaints'); // 'complaints' | 'critical' | 'dispatched'

  // Data states
  const [complaints, setComplaints] = useState([]);
  const [bins, setBins] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [requests, setRequests] = useState([]);
  const [activityFeed, setActivityFeed] = useState([]);
  const [loading, setLoading] = useState(true);

  // Selected item for map visual link
  const [selectedItem, setSelectedItem] = useState(null);

  // Lightbox photo preview
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Toast feedback
  const [toast, setToast] = useState(null);

  // Assign Driver Modal state
  const [assignModal, setAssignModal] = useState({
    isOpen: false,
    bin: null,
    requestId: null,
    complaint: null
  });

  // Add New Driver Modal state (Admin generates driver credentials)
  const [isAddDriverOpen, setIsAddDriverOpen] = useState(false);

  // Action execution state
  const [assigningId, setAssigningId] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4500);
  };

  // Fetch all core dashboard data
  const fetchData = async () => {
    try {
      setLoading(true);
      const [compsRes, binsRes, driversRes, reqsRes, actRes] = await Promise.all([
        apiFetch('/api/complaints'),
        apiFetch('/api/bins'),
        apiFetch('/api/drivers'), // /api/drivers returns all driver rows reliably
        apiFetch('/api/requests'),
        apiFetch('/api/dashboard/activity')
      ]);

      if (compsRes.ok) setComplaints(await compsRes.json());
      if (binsRes.ok) setBins(await binsRes.json());
      if (driversRes.ok) setDrivers(await driversRes.json());
      if (reqsRes.ok) setRequests(await reqsRes.json());
      if (actRes.ok) setActivityFeed(await actRes.json());
    } catch (err) {
      console.error('Error loading dashboard data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Socket.IO event listeners for live updates
  useEffect(() => {
    if (!socket) return;

    const handleRefresh = () => {
      fetchData();
    };

    const handleDriverLocation = (locationData) => {
      setDrivers((prev) =>
        prev.map((d) =>
          d.id === locationData.driverId
            ? {
                ...d,
                currentLatitude: locationData.latitude,
                currentLongitude: locationData.longitude,
                current_latitude: locationData.latitude,
                current_longitude: locationData.longitude,
                availability: locationData.availability || d.availability
              }
            : d
        )
      );
    };

    const handleCollectionCompleted = (data) => {
      showToast(`Driver collected ${data.binCode || 'bin'}! Fill level reset to 5%.`);
      fetchData();
    };

    socket.on('driver:location', handleDriverLocation);
    socket.on('collection:completed', handleCollectionCompleted);
    socket.on('bin:updated', handleRefresh);
    socket.on('complaint:created', handleRefresh);
    socket.on('complaint:updated', handleRefresh);
    socket.on('request:created', handleRefresh);
    socket.on('request:updated', handleRefresh);
    socket.on('driver:updated', handleRefresh);

    return () => {
      socket.off('driver:location', handleDriverLocation);
      socket.off('collection:completed', handleCollectionCompleted);
      socket.off('bin:updated', handleRefresh);
      socket.off('complaint:created', handleRefresh);
      socket.off('complaint:updated', handleRefresh);
      socket.off('request:created', handleRefresh);
      socket.off('request:updated', handleRefresh);
      socket.off('driver:updated', handleRefresh);
    };
  }, [socket]);

  // Compute available drivers list
  const availableDrivers = useMemo(() => {
    return drivers.filter((d) => d.availability === 'available');
  }, [drivers]);

  // Helper to find nearest driver for any given bin coordinates
  const getNearestDriverForBin = (binLat, binLng) => {
    if (!binLat || !binLng || availableDrivers.length === 0) return null;

    let nearest = null;
    let minDistance = Infinity;

    availableDrivers.forEach((driver) => {
      const lat = driver.currentLatitude || driver.current_latitude;
      const lng = driver.currentLongitude || driver.current_longitude;
      if (lat && lng) {
        const dist = getDistanceKm(binLat, binLng, lat, lng);
        if (dist !== null && dist < minDistance) {
          minDistance = dist;
          nearest = { ...driver, distanceKm: dist };
        }
      }
    });

    return nearest;
  };

  // Open complaints with nearest driver calculated
  const openComplaints = useMemo(() => {
    return complaints
      .filter((c) => c.status === 'open' || c.status === 'in_progress')
      .map((comp) => {
        const lat = comp.latitude || 12.9716;
        const lng = comp.longitude || 77.5946;
        const nearest = getNearestDriverForBin(lat, lng);
        return {
          ...comp,
          nearestDriver: nearest
        };
      });
  }, [complaints, availableDrivers]);

  // Critical bins (>=80%) needing collection
  const criticalBins = useMemo(() => {
    return bins
      .filter((b) => b.current_fill_percent >= 80 && b.status !== 'inactive')
      .map((bin) => {
        const nearest = getNearestDriverForBin(bin.latitude, bin.longitude);
        const assignedReq = requests.find((r) => r.bin_id === bin.id && r.status === 'assigned');
        return {
          ...bin,
          nearestDriver: nearest,
          assignedRequest: assignedReq
        };
      });
  }, [bins, availableDrivers, requests]);

  // Dispatched tasks / In-progress collection requests
  const dispatchedItems = useMemo(() => {
    return requests.filter((r) => r.status === 'assigned');
  }, [requests]);

  // Collections completed today count
  const completedTodayCount = useMemo(() => {
    const todayStr = new Date().toDateString();
    return requests.filter(
      (r) => r.status === 'completed' && r.completed_at && new Date(r.completed_at).toDateString() === todayStr
    ).length;
  }, [requests]);

  // ONE-CLICK ACTION: Assign nearest driver to a complaint
  const handleAssignNearestDriver = async (comp) => {
    try {
      setAssigningId(comp.id);
      const res = await apiFetch(`/api/complaints/${comp.id}/assign-nearest`, {
        method: 'POST'
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign nearest driver');
      }

      showToast(data.message || `Assigned nearest driver ${data.driver?.name} to collect the bin!`);
      fetchData();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setAssigningId(null);
    }
  };

  // ONE-CLICK ACTION: Assign nearest driver to a critical bin
  const handleAssignNearestToBin = async (bin) => {
    try {
      setAssigningId(bin.id);
      const res = await apiFetch('/api/requests/assign-nearest', {
        method: 'POST',
        body: JSON.stringify({ bin_id: bin.id })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign nearest driver');
      }

      showToast(data.message || `Assigned nearest driver ${data.driver?.name} to Bin ${bin.bin_code}!`);
      fetchData();
    } catch (err) {
      alert('Error: ' + err.message);
    } finally {
      setAssigningId(null);
    }
  };

  // ONE-CLICK ACTION: Mark complaint resolved once collected
  const handleResolveComplaint = async (comp) => {
    try {
      const res = await apiFetch(`/api/complaints/${comp.id}/resolve`, {
        method: 'POST',
        body: JSON.stringify({ resolution_note: 'Resolved and bin collected by municipal crew.' })
      });
      if (res.ok) {
        showToast(`Complaint #${comp.id} resolved and citizen notified.`);
        fetchData();
      }
    } catch (err) {
      alert('Error resolving complaint: ' + err.message);
    }
  };

  // Admin control: Unassign driver from collection request
  const handleUnassignRequest = async (requestId) => {
    try {
      const res = await apiFetch(`/api/requests/${requestId}/unassign`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unassign driver');
      showToast('Driver unassigned successfully. Request returned to pending queue.');
      fetchData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Admin control: Unassign driver from citizen complaint
  const handleUnassignComplaint = async (complaintId) => {
    try {
      const res = await apiFetch(`/api/complaints/${complaintId}/unassign`, {
        method: 'POST'
      });
      const data = await res.json();
      if (!res.ok) throw new Error(data.error || 'Failed to unassign driver');
      showToast('Driver unassigned from complaint.');
      fetchData();
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  // Open manual assign modal (pick any driver)
  const openCustomAssignModal = (item, type = 'complaint') => {
    if (type === 'complaint') {
      setAssignModal({
        isOpen: true,
        bin: {
          id: item.bin_id || 1,
          bin_code: item.bin_code || 'Bin',
          location_name: item.bin_location || 'Location',
          current_fill_percent: item.current_fill_percent || 85,
          latitude: item.latitude || 12.9716,
          longitude: item.longitude || 77.5946
        },
        requestId: null,
        complaint: item
      });
    } else {
      setAssignModal({
        isOpen: true,
        bin: item,
        requestId: null,
        complaint: null
      });
    }
  };

  // Map center calculation
  const mapCenter = useMemo(() => {
    if (selectedItem?.latitude && selectedItem?.longitude) {
      return [Number(selectedItem.latitude), Number(selectedItem.longitude)];
    }
    if (openComplaints.length > 0 && openComplaints[0].latitude) {
      return [Number(openComplaints[0].latitude), Number(openComplaints[0].longitude)];
    }
    return [12.9716, 77.5946];
  }, [selectedItem, openComplaints]);

  // Selected item line to nearest driver
  const connectionLine = useMemo(() => {
    if (!selectedItem) return null;
    const binLat = selectedItem.latitude;
    const binLng = selectedItem.longitude;
    const nearest = selectedItem.nearestDriver;
    if (binLat && binLng && nearest?.currentLatitude && nearest?.currentLongitude) {
      return [
        [Number(binLat), Number(binLng)],
        [Number(nearest.currentLatitude), Number(nearest.currentLongitude)]
      ];
    }
    return null;
  }, [selectedItem]);

  return (
    <div className="w-full space-y-6 pb-16 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[99999] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500/50 text-sm animate-in slide-in-from-top-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      {/* Lightbox Photo Preview */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-[99999] bg-black/80 backdrop-blur-sm flex items-center justify-center p-6 cursor-pointer animate-in fade-in"
          onClick={() => setPreviewPhoto(null)}
        >
          <div className="relative max-w-2xl max-h-[88vh] bg-white rounded-3xl overflow-hidden shadow-2xl p-3" onClick={(e) => e.stopPropagation()}>
            <img src={previewPhoto} alt="Citizen evidence" className="max-h-[78vh] w-auto mx-auto object-contain rounded-2xl" />
            <div className="flex justify-between items-center px-4 pt-3">
              <span className="text-sm font-black text-slate-800">Citizen Evidence Photo</span>
              <button onClick={() => setPreviewPhoto(null)} className="p-1 rounded-full bg-slate-100 text-slate-500 hover:text-slate-900 cursor-pointer">
                <X className="w-5 h-5" />
              </button>
            </div>
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 1. HERO COMMAND HEADER                                                    */}
      {/* ========================================================================= */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 rounded-3xl p-6 sm:p-7 text-white shadow-xl border border-slate-700/40 flex flex-col md:flex-row md:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-emerald-400 uppercase tracking-widest mb-1.5">
            <Sparkles className="h-4 w-4 text-emerald-400" /> Operational Command & Citizen Dispatch
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            SmartWaste Municipal Dashboard
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            Monitor incoming citizen complaints, track critical sensor fill levels, and trigger instant algorithmic nearest-driver collection dispatch.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <div className="flex items-center gap-2 bg-slate-950/70 border border-slate-700/60 px-4 py-2.5 rounded-2xl backdrop-blur-md">
            <Radio className={`w-4 h-4 ${isConnected ? 'text-emerald-400 animate-pulse' : 'text-rose-400'}`} />
            <span className="text-xs font-bold text-slate-200">
              {isConnected ? 'Socket.IO Stream Active' : 'Connecting...'}
            </span>
          </div>

          <button
            onClick={() => setIsAddDriverOpen(true)}
            title="Create and issue new driver credentials"
            className="flex items-center gap-2 bg-blue-600 hover:bg-blue-500 text-white font-black text-xs px-4 py-2.5 rounded-2xl shadow-lg transition-all cursor-pointer"
          >
            <UserPlus className="w-3.5 h-3.5" />
            <span>+ New Driver</span>
          </button>

          <button
            onClick={fetchData}
            title="Refresh telemetry"
            className="flex items-center gap-2 bg-emerald-600 hover:bg-emerald-500 text-white font-black text-xs px-4 py-2.5 rounded-2xl shadow-lg transition-all cursor-pointer"
          >
            <RefreshCw className={`w-3.5 h-3.5 ${loading ? 'animate-spin' : ''}`} />
            <span>Sync Live</span>
          </button>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 2. TOP HIGH-IMPACT KPI METRICS BAR                                        */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Open Citizen Complaints */}
        <div
          onClick={() => setActiveTab('complaints')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
            activeTab === 'complaints'
              ? 'bg-amber-50/80 dark:bg-amber-950/40 border-amber-400 shadow-md ring-2 ring-amber-400/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-amber-300 hover:shadow-md'
          }`}
        >
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Citizen Complaints
            </div>
            <div className="flex items-baseline gap-2.5 mt-1.5">
              <span className="text-3xl sm:text-4xl font-black text-amber-600 dark:text-amber-400">
                {openComplaints.length}
              </span>
              <span className="text-[11px] bg-amber-100 text-amber-800 font-extrabold px-2 py-0.5 rounded-full">
                Needs Dispatch
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">
              Civic reports awaiting action
            </div>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-amber-100/80 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
            <MessageSquareWarning className="w-7 h-7" />
          </div>
        </div>

        {/* Critical Bins (>=80%) */}
        <div
          onClick={() => setActiveTab('critical')}
          className={`p-5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between group ${
            activeTab === 'critical'
              ? 'bg-rose-50/80 dark:bg-rose-950/40 border-rose-400 shadow-md ring-2 ring-rose-400/30'
              : 'bg-white dark:bg-slate-900 border-slate-200 dark:border-slate-800 hover:border-rose-300 hover:shadow-md'
          }`}
        >
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Critical Bins (≥80%)
            </div>
            <div className="flex items-baseline gap-2.5 mt-1.5">
              <span className="text-3xl sm:text-4xl font-black text-rose-600 dark:text-rose-400">
                {criticalBins.length}
              </span>
              <span className="text-[11px] bg-rose-100 text-rose-800 font-extrabold px-2 py-0.5 rounded-full animate-pulse">
                Overflowing
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">
              Sensor threshold exceeded
            </div>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-rose-100/80 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
            <AlertTriangle className="w-7 h-7" />
          </div>
        </div>

        {/* Available Drivers */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between group">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Drivers Available
            </div>
            <div className="flex items-baseline gap-2.5 mt-1.5">
              <span className="text-3xl sm:text-4xl font-black text-blue-600 dark:text-blue-400">
                {availableDrivers.length}
              </span>
              <span className="text-[11px] bg-blue-100 text-blue-800 font-extrabold px-2 py-0.5 rounded-full">
                Ready for Dispatch
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">
              {availableDrivers.length} of {drivers.length} drivers idle & online
            </div>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-blue-100/80 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
            <Truck className="w-7 h-7" />
          </div>
        </div>

        {/* Collections Completed Today */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between group">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">
              Collections Today
            </div>
            <div className="flex items-baseline gap-2.5 mt-1.5">
              <span className="text-3xl sm:text-4xl font-black text-emerald-600 dark:text-emerald-400">
                {completedTodayCount}
              </span>
              <span className="text-[11px] bg-emerald-100 text-emerald-800 font-extrabold px-2 py-0.5 rounded-full">
                Emptied
              </span>
            </div>
            <div className="text-xs text-slate-500 mt-1 font-medium">
              Bins restored to 5% capacity
            </div>
          </div>
          <div className="w-13 h-13 rounded-2xl bg-emerald-100/80 dark:bg-emerald-900/40 text-emerald-600 dark:text-emerald-400 flex items-center justify-center group-hover:scale-110 transition-transform shadow-inner">
            <CheckCircle2 className="w-7 h-7" />
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 3. MAIN WORKSPACE: ACTION CENTER (LEFT) + FULL-SIZE LIVE MAP (RIGHT)      */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5 items-stretch">
        {/* LEFT COLUMN: CITIZEN COMPLAINTS & ACTION QUEUE (~7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[650px] overflow-hidden">
          {/* Header & Tabs */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2">
              <button
                onClick={() => setActiveTab('complaints')}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'complaints'
                    ? 'bg-amber-600 text-white shadow-md'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                }`}
              >
                <MessageSquareWarning className="w-4 h-4" />
                Citizen Complaints ({openComplaints.length})
              </button>

              <button
                onClick={() => setActiveTab('critical')}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'critical'
                    ? 'bg-rose-600 text-white shadow-md'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                }`}
              >
                <AlertTriangle className="w-4 h-4" />
                Critical Bins ({criticalBins.length})
              </button>

              <button
                onClick={() => setActiveTab('dispatched')}
                className={`px-4 py-2 rounded-xl text-xs font-black flex items-center gap-2 transition-all cursor-pointer ${
                  activeTab === 'dispatched'
                    ? 'bg-blue-600 text-white shadow-md'
                    : 'bg-slate-200/70 dark:bg-slate-800 text-slate-700 dark:text-slate-300 hover:bg-slate-300'
                }`}
              >
                <Truck className="w-4 h-4" />
                Dispatched ({dispatchedItems.length})
              </button>
            </div>

            <span className="text-xs text-slate-400 font-medium hidden sm:inline">
              Click any card to inspect on map
            </span>
          </div>

          {/* List Content */}
          <div className="flex-1 overflow-y-auto p-5 space-y-4">
            {/* TAB 1: CITIZEN COMPLAINTS */}
            {activeTab === 'complaints' && (
              openComplaints.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 text-center">
                  <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-3" />
                  <span className="font-black text-slate-700 dark:text-slate-200 text-base">All Citizen Complaints Resolved!</span>
                  <span className="text-xs text-slate-400 mt-1 max-w-sm">No unresolved complaints in queue. Incoming citizen submissions will stream here live.</span>
                </div>
              ) : (
                openComplaints.map((comp) => {
                  const nearest = comp.nearestDriver;
                  const isAssigned = comp.status === 'assigned';
                  const isCollected = comp.status === 'collected';
                  const isSelected = selectedItem?.id === comp.id;

                  return (
                    <div
                      key={`comp-${comp.id}`}
                      onClick={() => setSelectedItem(comp)}
                      className={`rounded-2xl p-4.5 border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-blue-50/50 dark:bg-blue-950/30 border-blue-400 shadow-md ring-2 ring-blue-400/20'
                          : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      {/* Top Row: Category Badge, Bin Code, Time */}
                      <div className="flex items-start justify-between gap-3">
                        <div className="flex items-center gap-2.5 flex-wrap">
                          <span className="px-2.5 py-1 rounded-lg text-xs font-black uppercase tracking-wider bg-amber-100 dark:bg-amber-900/50 text-amber-900 dark:text-amber-200 border border-amber-300/60">
                            {comp.type?.replace(/_/g, ' ')}
                          </span>
                          <span className="text-sm font-black text-slate-900 dark:text-white">
                            {comp.bin_code ? `Bin ${comp.bin_code}` : 'Municipal Area'}
                          </span>
                          {comp.current_fill_percent && (
                            <span className={`text-xs font-black ${comp.current_fill_percent >= 80 ? 'text-rose-600' : 'text-slate-600'}`}>
                              ({comp.current_fill_percent}% Capacity)
                            </span>
                          )}
                        </div>

                        <span className="text-xs text-slate-400 font-bold shrink-0">
                          {new Date(comp.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                        </span>
                      </div>

                      {/* Location & Citizen Info */}
                      <div className="mt-2 flex flex-wrap items-center justify-between text-xs text-slate-600 dark:text-slate-400 gap-2">
                        <div className="flex items-center gap-1.5">
                          <MapPin className="w-4 h-4 text-rose-500 shrink-0" />
                          <span className="font-semibold text-slate-800 dark:text-slate-200">{comp.bin_location || 'Bengaluru Municipal Ward'}</span>
                        </div>
                        <div className="flex items-center gap-1 text-slate-500">
                          <User className="w-3.5 h-3.5 text-slate-400" />
                          <span>Reported by: <strong className="text-slate-700 dark:text-slate-300">{comp.citizen_name || 'Citizen'}</strong> {comp.citizen_phone ? `(${comp.citizen_phone})` : ''}</span>
                        </div>
                      </div>

                      {/* Citizen description and photo thumbnail */}
                      <div className="mt-3 flex items-start gap-4 bg-white dark:bg-slate-900 p-3.5 rounded-xl border border-slate-200/80 dark:border-slate-800">
                        <div className="flex-1 text-xs sm:text-sm text-slate-700 dark:text-slate-300 italic leading-relaxed">
                          "{comp.description}"
                        </div>
                        {comp.photo_url && (
                          <div
                            onClick={(e) => {
                              e.stopPropagation();
                              setPreviewPhoto(comp.photo_url);
                            }}
                            className="relative group shrink-0 w-16 h-16 rounded-xl border-2 border-slate-300 dark:border-slate-700 overflow-hidden cursor-pointer shadow-xs"
                            title="Click to zoom evidence photo"
                          >
                            <img src={comp.photo_url} alt="Proof" className="w-full h-full object-cover group-hover:scale-110 transition-transform" />
                            <div className="absolute inset-0 bg-black/30 flex items-center justify-center opacity-0 group-hover:opacity-100 transition-opacity">
                              <ImageIcon className="w-4 h-4 text-white" />
                            </div>
                          </div>
                        )}
                      </div>

                      {/* Prominent Nearest Driver Dispatch Bar */}
                      <div className="mt-3.5 pt-3 border-t border-slate-200/70 dark:border-slate-800 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        {/* Nearest Driver Detected Info */}
                        <div className="flex items-center gap-2">
                          {nearest ? (
                            <div className="flex items-center gap-2 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-xl text-xs">
                              <Truck className="w-4 h-4 text-blue-600 dark:text-blue-400" />
                              <span className="font-bold text-slate-800 dark:text-slate-200">
                                Nearest: <strong className="text-blue-700 dark:text-blue-300 font-black">{nearest.name}</strong>
                              </span>
                              <span className="bg-blue-200/70 dark:bg-blue-900 text-blue-900 dark:text-blue-200 px-2 py-0.5 rounded-md font-extrabold text-[11px]">
                                {nearest.distanceKm} km away
                              </span>
                              <span className="text-slate-400 hidden sm:inline">({nearest.vehicle_plate || 'KA-01-EA'})</span>
                            </div>
                          ) : (
                            <span className="text-xs text-slate-400 italic flex items-center gap-1.5">
                              <Clock className="w-4 h-4 text-amber-500" />
                              All drivers currently assigned or off-duty
                            </span>
                          )}
                        </div>

                        {/* Action Dispatch Buttons */}
                        <div className="flex items-center gap-2.5">
                          {isCollected ? (
                            <button
                              type="button"
                              onClick={(e) => {
                                e.stopPropagation();
                                handleResolveComplaint(comp);
                              }}
                              className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white font-black px-4 py-2 rounded-xl text-xs shadow-md transition-colors cursor-pointer"
                            >
                              <Check className="w-4 h-4" />
                              Mark Resolved & Close
                            </button>
                          ) : (
                            <>
                              {/* 1-Click Assign Nearest Driver */}
                              <button
                                type="button"
                                disabled={!nearest || assigningId === comp.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssignNearestDriver(comp);
                                }}
                                className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 active:to-indigo-800 disabled:opacity-50 text-white font-black px-4 py-2 rounded-xl text-xs shadow-md transition-all cursor-pointer hover:shadow-lg"
                                title="Instantly dispatch the nearest available driver to collect this bin"
                              >
                                {assigningId === comp.id ? (
                                  <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                                ) : (
                                  <Zap className="w-4 h-4 text-yellow-300" />
                                )}
                                <span>Assign Nearest Driver</span>
                              </button>

                              {/* Manual Pick Driver Option */}
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCustomAssignModal(comp, 'complaint');
                                }}
                                className="bg-white dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-700 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold px-3.5 py-2 rounded-xl text-xs transition-colors cursor-pointer"
                              >
                                Pick Driver...
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* TAB 2: CRITICAL BINS (>=80%) */}
            {activeTab === 'critical' && (
              criticalBins.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 text-center">
                  <CheckCircle2 className="w-14 h-14 text-emerald-500 mb-3" />
                  <span className="font-black text-slate-700 dark:text-slate-200 text-base">All Municipal Bins Operating Normally</span>
                  <span className="text-xs text-slate-400 mt-1">No bins currently exceed 80% fill threshold.</span>
                </div>
              ) : (
                criticalBins.map((bin) => {
                  const nearest = bin.nearestDriver;
                  const isSelected = selectedItem?.id === bin.id;

                  return (
                    <div
                      key={`bin-${bin.id}`}
                      onClick={() => setSelectedItem(bin)}
                      className={`rounded-2xl p-4.5 border transition-all cursor-pointer ${
                        isSelected
                          ? 'bg-rose-50/50 dark:bg-rose-950/30 border-rose-400 shadow-md ring-2 ring-rose-400/20'
                          : 'bg-slate-50/60 dark:bg-slate-800/30 border-slate-200/90 dark:border-slate-800 hover:border-slate-300 hover:shadow-sm'
                      }`}
                    >
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-3">
                          <span className="font-black text-base text-slate-900 dark:text-white">{bin.bin_code}</span>
                          <span className="text-xs bg-rose-100 text-rose-800 font-black px-2.5 py-1 rounded-lg">
                            {bin.current_fill_percent}% Full
                          </span>
                        </div>
                        <span className="text-xs font-semibold text-slate-500">{bin.location_name}</span>
                      </div>

                      <div className="mt-3 w-full bg-slate-200 dark:bg-slate-700 rounded-full h-2.5 overflow-hidden">
                        <div className="bg-rose-600 h-full rounded-full transition-all duration-500" style={{ width: `${bin.current_fill_percent}%` }}></div>
                      </div>

                      <div className="mt-4 flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                        <div>
                          {bin.assignedRequest ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-emerald-800 dark:text-emerald-200 bg-emerald-50 dark:bg-emerald-950/50 border border-emerald-200 dark:border-emerald-800 px-3 py-1.5 rounded-xl text-xs">
                              <Truck className="w-4 h-4 text-emerald-600" />
                              Assigned to: <strong className="text-emerald-700 dark:text-emerald-300 font-black">{bin.assignedRequest.driver_name || 'Driver'}</strong> ({bin.assignedRequest.driver_vehicle_plate || 'KA-01'})
                            </span>
                          ) : nearest ? (
                            <span className="inline-flex items-center gap-1.5 font-bold text-slate-800 dark:text-slate-200 bg-blue-50 dark:bg-blue-950/50 border border-blue-200 dark:border-blue-800 px-3 py-1.5 rounded-xl text-xs">
                              <Truck className="w-4 h-4 text-blue-600" />
                              Nearest Driver: <strong className="text-blue-700 dark:text-blue-300">{nearest.name}</strong> ({nearest.distanceKm} km away)
                            </span>
                          ) : (
                            <span className="text-xs text-slate-400 italic">No available drivers online</span>
                          )}
                        </div>

                        <div className="flex items-center gap-2">
                          {bin.assignedRequest ? (
                            <>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  setAssignModal({
                                    isOpen: true,
                                    bin,
                                    requestId: bin.assignedRequest.id,
                                    complaint: null
                                  });
                                }}
                                className="bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
                              >
                                Reassign
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleUnassignRequest(bin.assignedRequest.id);
                                }}
                                className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
                              >
                                Unassign
                              </button>
                            </>
                          ) : (
                            <>
                              <button
                                type="button"
                                disabled={!nearest || assigningId === bin.id}
                                onClick={(e) => {
                                  e.stopPropagation();
                                  handleAssignNearestToBin(bin);
                                }}
                                className="inline-flex items-center gap-2 bg-rose-600 hover:bg-rose-700 active:bg-rose-800 text-white font-black px-4 py-2 rounded-xl text-xs shadow-md transition-colors cursor-pointer"
                              >
                                <Zap className="w-4 h-4 text-yellow-300" />
                                Assign Nearest Driver
                              </button>
                              <button
                                type="button"
                                onClick={(e) => {
                                  e.stopPropagation();
                                  openCustomAssignModal(bin, 'bin');
                                }}
                                className="bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold px-3 py-2 rounded-xl text-xs transition-colors cursor-pointer"
                              >
                                Pick Driver...
                              </button>
                            </>
                          )}
                        </div>
                      </div>
                    </div>
                  );
                })
              )
            )}

            {/* TAB 3: DISPATCHED ITEMS */}
            {activeTab === 'dispatched' && (
              dispatchedItems.length === 0 ? (
                <div className="h-full flex flex-col items-center justify-center text-slate-400 py-16 text-center">
                  <Truck className="w-14 h-14 text-slate-300 mb-3" />
                  <span className="font-black text-slate-700 dark:text-slate-200 text-base">No Active Dispatches</span>
                  <span className="text-xs text-slate-400 mt-1">Assign drivers from citizen complaints or critical bins to view active tasks.</span>
                </div>
              ) : (
                dispatchedItems.map((item) => {
                  const targetBin = bins.find((b) => b.id === item.bin_id) || {
                    id: item.bin_id,
                    bin_code: item.bin_code,
                    location_name: item.location_name,
                    latitude: item.latitude,
                    longitude: item.longitude,
                    current_fill_percent: item.current_fill_percent
                  };

                  return (
                    <div key={`disp-${item.id}`} className="p-4 bg-blue-50/50 dark:bg-blue-950/30 border border-blue-200/80 dark:border-blue-900 rounded-2xl flex flex-col sm:flex-row sm:items-center justify-between gap-3">
                      <div>
                        <div className="flex items-center gap-2.5">
                          <span className="font-bold text-xs text-slate-700 dark:text-slate-300">Request #{item.id}</span>
                          <span className="font-black text-sm text-blue-700 dark:text-blue-300">Bin {item.bin_code}</span>
                          <span className="text-[10px] bg-blue-100 dark:bg-blue-900 text-blue-800 dark:text-blue-200 font-black px-2 py-0.5 rounded-md uppercase">
                            {item.status}
                          </span>
                        </div>
                        <div className="text-xs text-slate-600 dark:text-slate-400 mt-1 font-medium">
                          Assigned to: <strong className="text-slate-800 dark:text-slate-200">{item.driver_name || 'Driver'}</strong> ({item.driver_vehicle_plate || 'KA-01'})
                        </div>
                        <div className="text-[11px] text-slate-400 mt-0.5">
                          Dispatched: {item.assigned_at ? new Date(item.assigned_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Recently'}
                        </div>
                      </div>

                      {/* Admin Controls: Reassign & Unassign */}
                      <div className="flex items-center gap-2 shrink-0">
                        <button
                          type="button"
                          onClick={() => setAssignModal({
                            isOpen: true,
                            bin: targetBin,
                            requestId: item.id,
                            complaint: item.complaint_id ? { id: item.complaint_id } : null
                          })}
                          className="bg-white dark:bg-slate-800 hover:bg-slate-100 border border-slate-300 dark:border-slate-700 text-slate-700 dark:text-slate-300 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Reassign
                        </button>
                        <button
                          type="button"
                          onClick={() => handleUnassignRequest(item.id)}
                          className="bg-rose-50 hover:bg-rose-100 dark:bg-rose-950/40 text-rose-700 dark:text-rose-300 border border-rose-200 dark:border-rose-800 font-bold px-3 py-1.5 rounded-xl text-xs transition-colors cursor-pointer"
                        >
                          Unassign
                        </button>
                      </div>
                    </div>
                  );
                })
              )
            )}
          </div>
        </div>

        {/* RIGHT COLUMN: FULL-SIZE LIVE DISPATCH MAP (~5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 shadow-sm flex flex-col h-[650px] overflow-hidden">
          {/* Map Header */}
          <div className="px-6 py-4 border-b border-slate-100 dark:border-slate-800 bg-slate-50/60 dark:bg-slate-800/40 flex items-center justify-between shrink-0">
            <div className="flex items-center gap-2.5">
              <Radio className="w-4 h-4 text-emerald-500 animate-pulse" />
              <div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Live Dispatch Map
                </h3>
                <p className="text-[11px] text-slate-500">Real-time driver GPS & critical sensor pins</p>
              </div>
            </div>
            <span className="text-xs font-black text-blue-600 bg-blue-50 dark:bg-blue-950/60 border border-blue-200 dark:border-blue-900 px-3 py-1 rounded-full">
              {availableDrivers.length} Drivers Online
            </span>
          </div>

          {/* Leaflet Map */}
          <div className="flex-1 w-full relative z-0">
            <MapContainer
              center={mapCenter}
              zoom={12}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%' }}
            >
              <MapViewHandler center={mapCenter} />
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a>'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />

              {/* Draw animated dotted route line between selected complaint bin and nearest driver */}
              {connectionLine && (
                <Polyline
                  positions={connectionLine}
                  color="#2563eb"
                  dashArray="8, 10"
                  weight={4}
                  opacity={0.9}
                />
              )}

              {/* Critical Bins and Complaint Bins Markers */}
              {bins.filter((b) => b.current_fill_percent >= 80 || complaints.some((c) => c.bin_id === b.id && c.status === 'open')).map((bin) => {
                const isSelected = selectedItem?.bin_id === bin.id || selectedItem?.id === bin.id;
                return (
                  <Marker
                    key={`map-bin-${bin.id}`}
                    position={[bin.latitude, bin.longitude]}
                    icon={createBinMarkerIcon(bin.current_fill_percent, isSelected)}
                  >
                    <Popup>
                      <div className="p-1 max-w-[220px] space-y-1.5 text-xs font-sans">
                        <div className="font-black text-sm text-slate-900">{bin.bin_code} ({bin.current_fill_percent}% Full)</div>
                        <div className="text-xs text-slate-600">{bin.location_name}</div>
                        <button
                          type="button"
                          onClick={() => handleAssignNearestToBin(bin)}
                          className="w-full mt-1.5 bg-blue-600 hover:bg-blue-700 text-white font-black py-1.5 px-3 rounded-lg text-xs shadow-xs cursor-pointer"
                        >
                          ⚡ Assign Nearest Driver
                        </button>
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Driver Truck Markers */}
              {drivers
                .filter((d) => (d.currentLatitude || d.current_latitude) && (d.currentLongitude || d.current_longitude))
                .map((driver) => {
                  const lat = driver.currentLatitude || driver.current_latitude;
                  const lng = driver.currentLongitude || driver.current_longitude;
                  const avail = driver.availability || 'available';
                  const isNearest = selectedItem?.nearestDriver?.id === driver.id;

                  return (
                    <Marker
                      key={`driver-${driver.id}`}
                      position={[lat, lng]}
                      icon={createDriverTruckIcon(avail, isNearest)}
                    >
                      <Popup>
                        <div className="p-1 space-y-1.5 text-xs text-slate-800 font-sans">
                          <div className="flex items-center justify-between border-b pb-1 font-black text-sm">
                            <span>{driver.name}</span>
                            <span className="text-[10px] uppercase font-bold text-blue-600">{avail}</span>
                          </div>
                          <div className="text-xs text-slate-600">Plate: <strong>{driver.vehicle_plate || 'KA-01'}</strong></div>
                          <div className="text-xs text-slate-600">Phone: {driver.phone || 'N/A'}</div>
                        </div>
                      </Popup>
                    </Marker>
                  );
                })}
            </MapContainer>

            {/* Map Legend Overlay */}
            <div className="absolute bottom-4 right-4 z-[400] bg-white/95 dark:bg-slate-900/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xl text-xs space-y-1.5 pointer-events-auto">
              <div className="font-black text-slate-900 dark:text-white border-b border-slate-200 dark:border-slate-800 pb-1 text-[11px] uppercase tracking-wider">Map Legend</div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-[11px]"><span className="w-2.5 h-2.5 rounded-full bg-rose-500 animate-pulse"></span> Critical / Reported Bin</div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-[11px]"><span className="w-2.5 h-2.5 rounded-full bg-blue-600"></span> Available Driver Truck</div>
              <div className="flex items-center gap-2 text-slate-700 dark:text-slate-300 text-[11px]"><span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span> Busy Driver Truck</div>
            </div>
          </div>
        </div>
      </div>

      {/* ========================================================================= */}
      {/* 4. BOTTOM SECTION: ACTIVE FLEET ROSTER & LIVE ACTIVITY FEED               */}
      {/* ========================================================================= */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-5">
        {/* Active Fleet Drivers Roster (5 cols) */}
        <div className="lg:col-span-5 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Truck className="w-5 h-5 text-blue-600" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Active Driver Fleet</h3>
            </div>
            <div className="flex items-center gap-2">
              <span className="text-xs font-bold text-slate-400">{drivers.length} Drivers</span>
              <button
                onClick={() => setIsAddDriverOpen(true)}
                className="flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black px-2.5 py-1 rounded-xl shadow-xs transition-all cursor-pointer"
              >
                <UserPlus className="w-3.5 h-3.5" />
                <span>+ Add Driver</span>
              </button>
            </div>
          </div>

          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
            {drivers.map((d) => (
              <div key={`roster-${d.id}`} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs">
                <div className="flex items-center gap-2.5">
                  <div className="w-8 h-8 rounded-full bg-blue-100 dark:bg-blue-900/60 text-blue-700 dark:text-blue-300 font-bold flex items-center justify-center text-xs">
                    {d.name ? d.name.charAt(0) : 'D'}
                  </div>
                  <div>
                    <div className="font-black text-slate-900 dark:text-white">{d.name}</div>
                    <div className="text-[11px] text-slate-500">{d.vehicle_plate || 'KA-01-EA'} • {d.phone || 'N/A'}</div>
                  </div>
                </div>

                <span className={`text-[10px] font-black px-2 py-0.5 rounded-full uppercase tracking-wider ${
                  d.availability === 'available'
                    ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-200'
                    : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-200'
                }`}>
                  {d.availability}
                </span>
              </div>
            ))}
          </div>
        </div>

        {/* Live Operational Activity Stream (7 cols) */}
        <div className="lg:col-span-7 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-sm space-y-3">
          <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
            <div className="flex items-center gap-2">
              <Activity className="w-5 h-5 text-teal-600" />
              <h3 className="text-sm font-black text-slate-900 dark:text-white">Live Activity Stream</h3>
            </div>
            <div className="flex items-center gap-1.5 text-xs text-emerald-600 font-bold">
              <Wifi className="w-3.5 h-3.5" />
              <span>Real-Time Socket Stream</span>
            </div>
          </div>

          <div className="space-y-2 max-h-[160px] overflow-y-auto pr-1">
            {activityFeed.length === 0 ? (
              <div className="text-xs text-slate-400 py-6 text-center">No recent activity recorded today.</div>
            ) : (
              activityFeed.slice(0, 6).map((act, idx) => (
                <div key={act.id || idx} className="flex items-center justify-between p-2.5 rounded-xl bg-slate-50 dark:bg-slate-800/50 border border-slate-200/70 dark:border-slate-800 text-xs">
                  <div className="flex items-center gap-2.5 min-w-0">
                    <CheckCircle2 className="w-4 h-4 text-emerald-500 shrink-0" />
                    <span className="font-bold text-slate-800 dark:text-slate-200 truncate">{act.text}</span>
                  </div>
                  <span className="text-[11px] text-slate-400 shrink-0 ml-2 font-medium">
                    {act.timestamp ? new Date(act.timestamp).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' }) : 'Now'}
                  </span>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* Assign Driver Modal (Manual Picker) */}
      <AssignDriverModal
        isOpen={assignModal.isOpen}
        onClose={() => setAssignModal({ isOpen: false, bin: null, requestId: null, complaint: null })}
        bin={assignModal.bin}
        requestId={assignModal.requestId}
        complaint={assignModal.complaint}
        onAssigned={() => {
          setAssignModal({ isOpen: false, bin: null, requestId: null, complaint: null });
          showToast('Driver assigned successfully!');
          fetchData();
        }}
      />

      {/* Add New Driver Modal (Admin Generates Credentials) */}
      <AddDriverModal
        isOpen={isAddDriverOpen}
        onClose={() => setIsAddDriverOpen(false)}
        onDriverCreated={() => {
          fetchData();
          showToast('New driver account created and credentials generated successfully!');
        }}
      />
    </div>
  );
}
