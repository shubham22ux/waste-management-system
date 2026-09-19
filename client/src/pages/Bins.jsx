import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { apiFetch } from '../api';
import { useSocket } from '../context/SocketContext';
import CollectionRequestsTable from '../components/CollectionRequestsTable';
import AssignDriverModal from '../components/AssignDriverModal';
import {
  Trash2,
  MapPin,
  Filter,
  Plus,
  Search,
  Edit,
  Trash,
  X,
  AlertTriangle,
  Clock,
  Truck,
  Phone,
  Layers
} from 'lucide-react';

const createBinIcon = (fillPercent, status) => {
  let color = '#10b981';
  let isCritical = false;

  if (status === 'damaged' || status === 'inactive') {
    color = '#64748b';
  } else if (fillPercent >= 80) {
    color = '#ef4444';
    isCritical = true;
  } else if (fillPercent >= 50) {
    color = '#f97316';
  }

  return L.divIcon({
    className: 'custom-bin-icon',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        ${isCritical ? `<div style="position: absolute; width: 36px; height: 36px; border-radius: 50%; background-color: rgba(239, 68, 68, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
        <div style="position: relative; width: 32px; height: 32px; border-radius: 50%; background-color: ${color}; border: 2px solid #ffffff; box-shadow: 0 4px 6px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 10px; font-weight: 800; font-family: sans-serif;">
          ${fillPercent}%
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16],
    popupAnchor: [0, -16]
  });
};

const createDriverMarkerIcon = (availability) => {
  let bgColor = '#2563eb'; // blue for available
  let shadowColor = 'rgba(37, 99, 235, 0.35)';

  if (availability === 'busy') {
    bgColor = '#f97316'; // orange for busy
    shadowColor = 'rgba(249, 115, 22, 0.4)';
  } else if (availability === 'off_duty') {
    bgColor = '#64748b'; // grey for off duty
    shadowColor = 'rgba(100, 116, 139, 0.35)';
  }

  return L.divIcon({
    className: 'custom-driver-truck-icon',
    html: `
      <div style="position: relative; width: 36px; height: 36px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background-color: ${shadowColor}; animation: pulse 2s infinite;"></div>
        <div style="position: relative; width: 32px; height: 32px; border-radius: 50%; background-color: ${bgColor}; border: 2.5px solid #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff;">
          <svg xmlns="http://www.w3.org/2000/svg" width="17" height="17" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
            <path d="M15 18H9"/>
            <path d="M19 18h2a1 1 0 0 0 1-1v-5l-3-4h-5v10Z"/>
            <circle cx="7" cy="18" r="2"/>
            <circle cx="17" cy="18" r="2"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [36, 36],
    iconAnchor: [18, 18],
    popupAnchor: [0, -18]
  });
};

export default function Bins() {
  const [bins, setBins] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [fillFilter, setFillFilter] = useState('all');

  // Map Layer Visibility Checkboxes (both on by default)
  const [showBins, setShowBins] = useState(true);
  const [showDrivers, setShowDrivers] = useState(true);

  const [isAddModalOpen, setIsAddModalOpen] = useState(false);
  const [editingBin, setEditingBin] = useState(null);
  const [deletingBin, setDeletingBin] = useState(null);
  const [assignModal, setAssignModal] = useState({ isOpen: false, bin: null });

  const [formData, setFormData] = useState({
    bin_code: '',
    location_name: '',
    latitude: 12.9716,
    longitude: 77.5946,
    capacity_liters: 1000,
    current_fill_percent: 0,
    status: 'active'
  });

  const { socket } = useSocket();

  const fetchBins = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/bins');
      if (res.ok) {
        const data = await res.json();
        setBins(data);
      }
    } catch (err) {
      console.error('Failed to fetch bins', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchDrivers = async () => {
    try {
      const res = await apiFetch('/api/drivers/locations');
      if (res.ok) {
        const data = await res.json();
        setDrivers(data);
      }
    } catch (err) {
      console.error('Failed to fetch drivers for map', err);
    }
  };

  useEffect(() => {
    fetchBins();
    fetchDrivers();
  }, []);

  useEffect(() => {
    if (!socket) return;

    const handleBinUpdate = (updatedBin) => {
      setBins((prevBins) => {
        const exists = prevBins.some((b) => b.id === updatedBin.id);
        if (exists) {
          return prevBins.map((b) => (b.id === updatedBin.id ? updatedBin : b));
        }
        return [updatedBin, ...prevBins];
      });
    };

    const handleBinDelete = ({ id }) => {
      setBins((prevBins) => prevBins.filter((b) => b.id !== id));
    };

    // Live driver location tracking from Socket.IO
    const handleDriverLocation = (updatedDriver) => {
      setDrivers((prevDrivers) => {
        const exists = prevDrivers.some((d) => d.id === updatedDriver.id);
        if (exists) {
          return prevDrivers.map((d) => (d.id === updatedDriver.id ? { ...d, ...updatedDriver } : d));
        }
        return [...prevDrivers, updatedDriver];
      });
    };

    socket.on('bin:updated', handleBinUpdate);
    socket.on('bin:deleted', handleBinDelete);
    socket.on('driver:location', handleDriverLocation);

    return () => {
      socket.off('bin:updated', handleBinUpdate);
      socket.off('bin:deleted', handleBinDelete);
      socket.off('driver:location', handleDriverLocation);
    };
  }, [socket]);

  const filteredBins = useMemo(() => {
    return bins.filter((bin) => {
      const matchesSearch =
        bin.bin_code.toLowerCase().includes(search.toLowerCase()) ||
        bin.location_name.toLowerCase().includes(search.toLowerCase());

      const matchesStatus = statusFilter === 'all' || bin.status === statusFilter;

      let matchesFill = true;
      if (fillFilter === 'critical') matchesFill = bin.current_fill_percent >= 80;
      else if (fillFilter === 'medium') matchesFill = bin.current_fill_percent >= 50 && bin.current_fill_percent < 80;
      else if (fillFilter === 'low') matchesFill = bin.current_fill_percent < 50;

      return matchesSearch && matchesStatus && matchesFill;
    });
  }, [bins, search, statusFilter, fillFilter]);

  const handleCreateBin = async (e) => {
    e.preventDefault();
    try {
      const res = await apiFetch('/api/bins', {
        method: 'POST',
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setIsAddModalOpen(false);
        fetchBins();
      }
    } catch (err) {
      alert('Error creating bin: ' + err.message);
    }
  };

  const handleUpdateBin = async (e) => {
    e.preventDefault();
    if (!editingBin) return;
    try {
      const res = await apiFetch(`/api/bins/${editingBin.id}`, {
        method: 'PUT',
        body: JSON.stringify(formData)
      });
      if (res.ok) {
        setEditingBin(null);
        fetchBins();
      }
    } catch (err) {
      alert('Error updating bin: ' + err.message);
    }
  };

  const handleDeleteBin = async () => {
    if (!deletingBin) return;
    try {
      const res = await apiFetch(`/api/bins/${deletingBin.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        setDeletingBin(null);
        fetchBins();
      }
    } catch (err) {
      alert('Error deleting bin: ' + err.message);
    }
  };

  const openEditModal = (bin) => {
    setEditingBin(bin);
    setFormData({
      bin_code: bin.bin_code,
      location_name: bin.location_name,
      latitude: bin.latitude,
      longitude: bin.longitude,
      capacity_liters: bin.capacity_liters,
      current_fill_percent: bin.current_fill_percent,
      status: bin.status
    });
  };

  const openAddModal = () => {
    const nextNum = bins.length + 1;
    setFormData({
      bin_code: `B-${String(nextNum).padStart(3, '0')}`,
      location_name: '',
      latitude: 12.9716 + (Math.random() * 0.05 - 0.025),
      longitude: 77.5946 + (Math.random() * 0.05 - 0.025),
      capacity_liters: 1000,
      current_fill_percent: 15,
      status: 'active'
    });
    setIsAddModalOpen(true);
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
        <div>
          <h2 className="text-xl font-bold text-slate-900 flex items-center gap-2">
            <Trash2 className="h-6 w-6 text-emerald-600" />
            Real-Time Bin Monitoring & Fleet Map
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Live telemetry stream: updates every 15s via Socket.IO IoT Sensor Simulator.
          </p>
        </div>
        <button
          type="button"
          onClick={openAddModal}
          className="inline-flex items-center gap-2 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white text-xs font-bold px-4 py-2.5 rounded-xl transition-all shadow-md cursor-pointer"
        >
          <Plus className="h-4 w-4" /> Add New Bin
        </button>
      </div>

      {/* Map Visibility Controls (Declutter checkboxes) */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 bg-white px-4 py-3 rounded-2xl border border-slate-200 shadow-xs">
        <div className="flex items-center gap-4 text-xs font-bold text-slate-700">
          <span className="text-slate-400 font-semibold uppercase tracking-wider text-[10px] flex items-center gap-1">
            <Layers className="w-3.5 h-3.5 text-slate-400" /> Map Layers:
          </span>
          <label className="inline-flex items-center gap-2 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition-colors">
            <input
              type="checkbox"
              id="checkbox-show-bins"
              checked={showBins}
              onChange={(e) => setShowBins(e.target.checked)}
              className="w-4 h-4 text-emerald-600 rounded focus:ring-emerald-500 cursor-pointer accent-emerald-600"
            />
            <span className="flex items-center gap-1.5">
              <Trash2 className="w-3.5 h-3.5 text-emerald-600" />
              Show Bins ({bins.length})
            </span>
          </label>

          <label className="inline-flex items-center gap-2 cursor-pointer select-none bg-slate-50 hover:bg-slate-100 border border-slate-200 px-3 py-1.5 rounded-xl transition-colors">
            <input
              type="checkbox"
              id="checkbox-show-drivers"
              checked={showDrivers}
              onChange={(e) => setShowDrivers(e.target.checked)}
              className="w-4 h-4 text-blue-600 rounded focus:ring-blue-500 cursor-pointer accent-blue-600"
            />
            <span className="flex items-center gap-1.5">
              <Truck className="w-3.5 h-3.5 text-blue-600" />
              Show Drivers ({drivers.length})
            </span>
          </label>
        </div>

        <div className="flex items-center gap-2 text-[11px] text-slate-500 font-medium">
          <span className="inline-block w-2 h-2 rounded-full bg-emerald-500 animate-pulse"></span>
          Live IoT Sensors & Driver Telemetry Stream
        </div>
      </div>

      {/* Map Container */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-sm relative">
        <div className="h-[440px] w-full relative z-0">
          <MapContainer
            center={[12.9716, 77.5946]}
            zoom={12}
            scrollWheelZoom={true}
            style={{ height: '100%', width: '100%' }}
          >
            <TileLayer
              attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
              url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
            />

            {/* Bins Layer */}
            {showBins && bins.map((bin) => (
              <Marker
                key={`bin-${bin.id}`}
                position={[bin.latitude, bin.longitude]}
                icon={createBinIcon(bin.current_fill_percent, bin.status)}
              >
                <Popup>
                  <div className="p-1 max-w-xs space-y-2">
                    <div className="flex items-center justify-between gap-2 border-b pb-1">
                      <span className="font-extrabold text-slate-800 text-sm">{bin.bin_code}</span>
                      <span className="text-[10px] px-2 py-0.5 rounded font-semibold uppercase bg-emerald-100 text-emerald-800">
                        {bin.status}
                      </span>
                    </div>
                    <div className="text-xs text-slate-600 font-medium">{bin.location_name}</div>
                    <div className="space-y-1">
                      <div className="flex justify-between text-[11px] font-bold">
                        <span>Fill Occupancy:</span>
                        <span className={bin.current_fill_percent >= 80 ? 'text-rose-600' : 'text-emerald-600'}>
                          {bin.current_fill_percent}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border">
                        <div
                          className={`h-full ${bin.current_fill_percent >= 80 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${bin.current_fill_percent}%` }}
                        ></div>
                      </div>
                    </div>

                    {/* Assign Driver Button in Map Popup */}
                    <button
                      type="button"
                      onClick={() => setAssignModal({ isOpen: true, bin })}
                      className="w-full mt-2 inline-flex items-center justify-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white font-bold py-1.5 px-3 rounded-xl text-xs transition-colors shadow-2xs"
                    >
                      <Truck className="w-3.5 h-3.5" />
                      Assign Driver
                    </button>
                  </div>
                </Popup>
              </Marker>
            ))}

            {/* Driver Markers Layer */}
            {showDrivers && drivers.filter(d => (d.currentLatitude || d.current_latitude) && (d.currentLongitude || d.current_longitude)).map((driver) => {
              const lat = driver.currentLatitude || driver.current_latitude;
              const lng = driver.currentLongitude || driver.current_longitude;
              const avail = driver.availability || 'available';
              const plate = driver.vehicle_plate || driver.vehiclePlate || 'Unassigned';
              const task = driver.current_task || driver.currentTask;

              return (
                <Marker
                  key={`driver-${driver.id}`}
                  position={[lat, lng]}
                  icon={createDriverMarkerIcon(avail)}
                >
                  <Popup>
                    <div className="p-1 max-w-xs space-y-2 text-slate-800 font-sans">
                      <div className="flex items-center justify-between gap-2 border-b pb-1.5">
                        <div className="flex items-center gap-1.5 font-black text-sm text-slate-900">
                          <Truck className="w-4 h-4 text-slate-700 shrink-0" />
                          <span>{driver.name}</span>
                        </div>
                        <span className={`text-[10px] px-2 py-0.5 rounded-full font-bold uppercase tracking-wider ${
                          avail === 'available' ? 'bg-blue-100 text-blue-800 border border-blue-200' :
                          avail === 'busy' ? 'bg-amber-100 text-amber-800 border border-amber-200' :
                          'bg-slate-100 text-slate-700 border border-slate-200'
                        }`}>
                          {avail === 'available' ? 'Available' : avail === 'busy' ? 'Busy' : 'Off Duty'}
                        </span>
                      </div>

                      <div className="text-xs space-y-1.5 text-slate-600">
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-500">Vehicle:</span>
                          <span className="font-mono font-bold text-slate-800 bg-slate-100 px-1.5 py-0.5 rounded text-[11px]">{plate}</span>
                        </div>
                        <div className="flex items-center justify-between">
                          <span className="font-semibold text-slate-500">Phone:</span>
                          <span className="font-medium text-slate-800">{driver.phone || 'N/A'}</span>
                        </div>
                        <div className="pt-1.5 border-t border-slate-100">
                          <div className="text-[10px] uppercase font-bold tracking-wider text-slate-400">Current Task:</div>
                          <div className="text-xs font-semibold text-slate-800 mt-0.5">
                            {task ? (
                              <span className="text-emerald-700 font-bold flex items-center gap-1">
                                <span className="w-1.5 h-1.5 rounded-full bg-emerald-500 inline-block"></span>
                                {task}
                              </span>
                            ) : (
                              <span className="text-slate-400 italic">No active route (Idle / Available)</span>
                            )}
                          </div>
                        </div>
                      </div>
                    </div>
                  </Popup>
                </Marker>
              );
            })}
          </MapContainer>

          {/* Map Legend Overlay */}
          <div className="absolute bottom-4 right-4 z-[400] bg-white/95 backdrop-blur-md p-3 rounded-2xl border border-slate-200/90 shadow-xl text-[11px] space-y-2.5 pointer-events-auto max-w-[210px]">
            <div className="font-black text-slate-900 text-xs flex items-center justify-between border-b border-slate-100 pb-1.5">
              <span>Map Legend</span>
              <span className="text-[10px] text-slate-400 font-normal">Live</span>
            </div>

            {/* Bins Legend */}
            <div className="space-y-1">
              <div className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider">Bins (Fill Level)</div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-emerald-500 shrink-0 border border-emerald-600"></span>
                <span className="text-slate-700 font-medium">&lt; 50% Normal</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 border border-amber-600"></span>
                <span className="text-slate-700 font-medium">50–79% Moderate</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-rose-500 shrink-0 border border-rose-600 animate-pulse"></span>
                <span className="text-slate-700 font-medium">≥ 80% Critical</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0 border border-slate-600"></span>
                <span className="text-slate-700 font-medium">Damaged / Inactive</span>
              </div>
            </div>

            {/* Drivers Legend */}
            <div className="space-y-1 pt-1.5 border-t border-slate-100">
              <div className="font-extrabold text-[10px] text-slate-400 uppercase tracking-wider">Drivers (Truck)</div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-blue-600 shrink-0 border border-blue-700"></span>
                <span className="text-slate-700 font-medium">Blue: Available</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-amber-500 shrink-0 border border-amber-600"></span>
                <span className="text-slate-700 font-medium">Orange: Busy</span>
              </div>
              <div className="flex items-center gap-2">
                <span className="w-2.5 h-2.5 rounded-full bg-slate-500 shrink-0 border border-slate-600"></span>
                <span className="text-slate-700 font-medium">Grey: Off Duty</span>
              </div>
            </div>
          </div>
        </div>
      </div>

      {/* Filter & Search Controls */}
      <div className="bg-white p-4 rounded-xl border border-slate-200 shadow-xs flex flex-col md:flex-row items-center justify-between gap-3">
        <div className="relative w-full md:w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search code or location..."
            className="w-full pl-9 pr-4 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-emerald-500 outline-none transition-all"
          />
        </div>

        <div className="flex items-center gap-2 w-full md:w-auto">
          <Filter className="h-4 w-4 text-slate-400 shrink-0" />
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 outline-none"
          >
            <option value="all">All Statuses</option>
            <option value="active">Active Only</option>
            <option value="damaged">Damaged Only</option>
            <option value="inactive">Inactive Only</option>
          </select>

          <select
            value={fillFilter}
            onChange={(e) => setFillFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 outline-none"
          >
            <option value="all">All Fill Levels</option>
            <option value="critical">Critical (≥80%)</option>
            <option value="medium">Medium (50–79%)</option>
            <option value="low">Low (&lt;50%)</option>
          </select>
        </div>
      </div>

      {/* Bins Table */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs text-slate-600">
            <thead className="bg-slate-50 text-slate-700 font-bold uppercase border-b border-slate-200">
              <tr>
                <th className="px-5 py-3.5">Bin Code</th>
                <th className="px-5 py-3.5">Location</th>
                <th className="px-5 py-3.5">Fill Level (%)</th>
                <th className="px-5 py-3.5">Est. Time Until Full</th>
                <th className="px-5 py-3.5">Capacity</th>
                <th className="px-5 py-3.5">Status</th>
                <th className="px-5 py-3.5 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {filteredBins.map((bin) => (
                <tr key={bin.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-5 py-3.5 font-bold text-slate-900">{bin.bin_code}</td>
                  <td className="px-5 py-3.5 font-medium text-slate-800">{bin.location_name}</td>
                  <td className="px-5 py-3.5">
                    <div className="w-36 space-y-1">
                      <div className="flex justify-between font-bold">
                        <span className={bin.current_fill_percent >= 80 ? 'text-rose-600' : 'text-emerald-600'}>
                          {bin.current_fill_percent}%
                        </span>
                      </div>
                      <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden border">
                        <div
                          className={`h-full ${bin.current_fill_percent >= 80 ? 'bg-rose-500' : 'bg-emerald-500'}`}
                          style={{ width: `${bin.current_fill_percent}%` }}
                        ></div>
                      </div>
                    </div>
                  </td>
                  <td className="px-5 py-3.5">
                    {bin.status !== 'active' ? (
                      <span className="text-slate-400 italic text-[11px]">N/A (Inactive)</span>
                    ) : bin.fill_prediction_status === 'full_now' || bin.current_fill_percent >= 100 ? (
                      <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-black bg-rose-100 text-rose-800 border border-rose-300 animate-pulse">
                        <AlertTriangle className="h-3 w-3" /> FULL NOW
                      </span>
                    ) : bin.fill_prediction_status === 'critical' || (bin.estimated_hours_until_full !== null && bin.estimated_hours_until_full < 3.0) ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-rose-50 text-rose-700 border border-rose-200">
                          <Clock className="h-3 w-3 text-rose-600" /> ~{bin.estimated_hours_until_full} hrs
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono">+{bin.fill_rate_per_hour || 5}%/hr</div>
                      </div>
                    ) : bin.fill_prediction_status === 'warning' || (bin.estimated_hours_until_full !== null && bin.estimated_hours_until_full <= 8.0) ? (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-amber-50 text-amber-700 border border-amber-200">
                          <Clock className="h-3 w-3 text-amber-600" /> ~{bin.estimated_hours_until_full} hrs
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono">+{bin.fill_rate_per_hour || 4}%/hr</div>
                      </div>
                    ) : (
                      <div className="space-y-0.5">
                        <span className="inline-flex items-center gap-1 px-2 py-0.5 rounded-full text-[11px] font-bold bg-emerald-50 text-emerald-700 border border-emerald-200">
                          <Clock className="h-3 w-3 text-emerald-600" /> ~{bin.estimated_hours_until_full} hrs
                        </span>
                        <div className="text-[10px] text-slate-400 font-mono">+{bin.fill_rate_per_hour || 4}%/hr</div>
                      </div>
                    )}
                  </td>
                  <td className="px-5 py-3.5 font-mono">{bin.capacity_liters} L</td>
                  <td className="px-5 py-3.5">
                    <span
                      className={`px-2.5 py-1 rounded-full text-[10px] font-bold uppercase ${
                        bin.status === 'active' ? 'bg-emerald-100 text-emerald-800' : 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {bin.status}
                    </span>
                  </td>
                  <td className="px-5 py-3.5 text-right space-x-1">
                    <button onClick={() => openEditModal(bin)} className="p-1.5 text-slate-500 hover:text-emerald-600">
                      <Edit className="h-4 w-4" />
                    </button>
                    <button onClick={() => setDeletingBin(bin)} className="p-1.5 text-slate-500 hover:text-rose-600">
                      <Trash className="h-4 w-4" />
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>
      </div>

      {/* Collection Requests Queue Section */}
      <CollectionRequestsTable />

      {/* Add/Edit Modal */}
      {(isAddModalOpen || editingBin) && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-md w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">
                {editingBin ? `Edit Bin: ${editingBin.bin_code}` : 'Add New Smart Waste Bin'}
              </h3>
              <button onClick={() => { setIsAddModalOpen(false); setEditingBin(null); }} className="text-slate-400">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={editingBin ? handleUpdateBin : handleCreateBin} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Bin Code</label>
                <input
                  type="text"
                  value={formData.bin_code}
                  onChange={(e) => setFormData({ ...formData, bin_code: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl outline-none"
                  required
                />
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Location Name</label>
                <input
                  type="text"
                  value={formData.location_name}
                  onChange={(e) => setFormData({ ...formData, location_name: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl outline-none"
                  required
                />
              </div>

              <div className="grid grid-cols-2 gap-2">
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Capacity (Liters)</label>
                  <input
                    type="number"
                    value={formData.capacity_liters}
                    onChange={(e) => setFormData({ ...formData, capacity_liters: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl outline-none"
                    required
                  />
                </div>
                <div>
                  <label className="block font-semibold text-slate-700 uppercase mb-1">Current Fill (%)</label>
                  <input
                    type="number"
                    min="0"
                    max="100"
                    value={formData.current_fill_percent}
                    onChange={(e) => setFormData({ ...formData, current_fill_percent: parseInt(e.target.value) })}
                    className="w-full px-3 py-2 bg-slate-50 border rounded-xl outline-none"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Status</label>
                <select
                  value={formData.status}
                  onChange={(e) => setFormData({ ...formData, status: e.target.value })}
                  className="w-full px-3 py-2 bg-slate-50 border rounded-xl outline-none"
                >
                  <option value="active">Active</option>
                  <option value="damaged">Damaged</option>
                  <option value="inactive">Inactive</option>
                </select>
              </div>

              <div className="pt-2 flex justify-end gap-2">
                <button
                  type="button"
                  onClick={() => { setIsAddModalOpen(false); setEditingBin(null); }}
                  className="px-4 py-2 bg-slate-100 text-slate-600 rounded-xl font-semibold"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl font-semibold shadow-md"
                >
                  {editingBin ? 'Save Changes' : 'Create Bin'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingBin && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4 text-center">
            <AlertTriangle className="h-8 w-8 text-rose-600 mx-auto" />
            <div>
              <h3 className="text-base font-bold text-slate-900">Delete Bin {deletingBin.bin_code}?</h3>
              <p className="text-xs text-slate-500 mt-1">This action cannot be undone.</p>
            </div>
            <div className="flex justify-center gap-2">
              <button onClick={() => setDeletingBin(null)} className="px-4 py-2 bg-slate-100 text-xs font-semibold rounded-xl">
                Cancel
              </button>
              <button onClick={handleDeleteBin} className="px-4 py-2 bg-rose-600 text-white text-xs font-semibold rounded-xl">
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Assign Driver Modal */}
      <AssignDriverModal
        isOpen={assignModal.isOpen}
        onClose={() => setAssignModal({ isOpen: false, bin: null })}
        bin={assignModal.bin}
        onAssigned={() => {
          fetchBins();
          fetchDrivers();
        }}
      />
    </div>
  );
}
