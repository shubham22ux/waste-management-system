import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup } from 'react-leaflet';
import L from 'leaflet';
import { useNavigate } from 'react-router-dom';
import { apiFetch } from '../../api';
import { useSocket } from '../../context/SocketContext';
import {
  MapPin,
  Trash2,
  Search,
  Filter,
  AlertTriangle,
  ArrowRight,
  Sparkles,
  CheckCircle2
} from 'lucide-react';

const createCitizenBinIcon = (fillPercent, status) => {
  let color = '#10b981'; // Green (available)
  let isCritical = false;

  if (status === 'damaged' || status === 'inactive') {
    color = '#64748b'; // Slate (damaged)
  } else if (fillPercent >= 80) {
    color = '#ef4444'; // Red (critical / full)
    isCritical = true;
  } else if (fillPercent >= 50) {
    color = '#f59e0b'; // Amber (moderate)
  }

  return L.divIcon({
    className: 'custom-citizen-bin-icon',
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        ${isCritical ? `<div style="position: absolute; width: 40px; height: 40px; border-radius: 50%; background-color: rgba(239, 68, 68, 0.4); animation: ping 1.5s cubic-bezier(0, 0, 0.2, 1) infinite;"></div>` : ''}
        <div style="position: relative; width: 32px; height: 32px; border-radius: 50%; background-color: ${color}; border: 2.5px solid #ffffff; box-shadow: 0 4px 8px -1px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 11px; font-weight: 800; font-family: ui-sans-serif, system-ui, sans-serif;">
          ${fillPercent}%
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17],
    popupAnchor: [0, -17]
  });
};

export default function NearbyBins() {
  const navigate = useNavigate();
  const { socket } = useSocket();

  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterState, setFilterState] = useState('all'); // 'all', 'available', 'full', 'damaged'

  const fetchBins = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/bins');
      if (res.ok) {
        const data = await res.json();
        setBins(data);
      }
    } catch (err) {
      console.error('Failed to load civic bins', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchBins();
  }, []);

  // Real-time IoT bin update stream
  useEffect(() => {
    if (!socket) return;

    const handleBinUpdate = (updatedBin) => {
      setBins((prev) =>
        prev.map((b) => (b.id === updatedBin.id ? { ...b, ...updatedBin } : b))
      );
    };

    socket.on('bin:updated', handleBinUpdate);
    return () => {
      socket.off('bin:updated', handleBinUpdate);
    };
  }, [socket]);

  // Filtered bins
  const filteredBins = useMemo(() => {
    return bins.filter((bin) => {
      const matchesSearch =
        bin.bin_code.toLowerCase().includes(search.toLowerCase()) ||
        bin.location_name.toLowerCase().includes(search.toLowerCase());

      if (!matchesSearch) return false;

      if (filterState === 'available') return bin.status === 'active' && bin.current_fill_percent < 80;
      if (filterState === 'full') return bin.current_fill_percent >= 80;
      if (filterState === 'damaged') return bin.status === 'damaged';

      return true;
    });
  }, [bins, search, filterState]);

  // Map center calculation
  const mapCenter = useMemo(() => {
    if (bins.length > 0) {
      const avgLat = bins.reduce((sum, b) => sum + b.latitude, 0) / bins.length;
      const avgLng = bins.reduce((sum, b) => sum + b.longitude, 0) / bins.length;
      return [avgLat, avgLng];
    }
    return [12.9716, 77.5946];
  }, [bins]);

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <MapPin className="h-6 w-6" />
            </div>
            Nearby Public Bins Map
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Check real-time waste bin fill levels in your neighborhood before heading out for disposal.
          </p>
        </div>

        {/* Legend */}
        <div className="flex items-center gap-3 bg-white p-2.5 rounded-xl border border-slate-200 shadow-xs text-[11px] font-bold">
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-emerald-500"></span>
            <span className="text-slate-600">&lt;50%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-amber-500"></span>
            <span className="text-slate-600">50-79%</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-rose-500"></span>
            <span className="text-slate-600">≥80% Full</span>
          </div>
          <div className="flex items-center gap-1">
            <span className="w-2.5 h-2.5 rounded-full bg-slate-500"></span>
            <span className="text-slate-600">Damaged</span>
          </div>
        </div>
      </div>

      {/* Controls: Search & Filter Tabs */}
      <div className="flex flex-col md:flex-row md:items-center justify-between gap-3">
        <div className="relative flex-1 max-w-md">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by bin code, street, or landmark..."
            className="w-full pl-10 pr-4 py-2.5 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:border-emerald-500 focus:outline-none shadow-xs"
          />
        </div>

        <div className="flex items-center gap-1.5 overflow-x-auto pb-1 text-xs">
          {[
            { id: 'all', label: 'All Bins' },
            { id: 'available', label: 'Available (<80%)' },
            { id: 'full', label: 'Full / Critical' },
            { id: 'damaged', label: 'Damaged' }
          ].map((tab) => (
            <button
              key={tab.id}
              onClick={() => setFilterState(tab.id)}
              className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap ${
                filterState === tab.id
                  ? 'bg-slate-900 text-white shadow-xs'
                  : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Leaflet Map Card */}
      <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs">
        <div className="h-[480px] w-full relative">
          {loading ? (
            <div className="absolute inset-0 flex items-center justify-center bg-slate-50 text-slate-400 text-xs font-semibold">
              <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mr-2"></div>
              Rendering civic telemetry map...
            </div>
          ) : (
            <MapContainer
              center={mapCenter}
              zoom={13}
              scrollWheelZoom={true}
              style={{ height: '100%', width: '100%' }}
            >
              <TileLayer
                attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
                url="https://{s}.tile.openstreetmap.org/{z}/{x}/{y}.png"
              />
              {filteredBins.map((bin) => (
                <Marker
                  key={bin.id}
                  position={[bin.latitude, bin.longitude]}
                  icon={createCitizenBinIcon(bin.current_fill_percent, bin.status)}
                >
                  <Popup className="custom-popup">
                    <div className="p-1 space-y-2 min-w-[220px]">
                      <div className="flex items-center justify-between border-b border-slate-100 pb-1.5">
                        <span className="font-extrabold text-xs text-slate-900">{bin.bin_code}</span>
                        <span
                          className={`text-[9px] uppercase px-1.5 py-0.5 rounded font-black ${
                            bin.status === 'damaged'
                              ? 'bg-slate-100 text-slate-700'
                              : bin.current_fill_percent >= 80
                              ? 'bg-rose-100 text-rose-800'
                              : 'bg-emerald-100 text-emerald-800'
                          }`}
                        >
                          {bin.status === 'damaged' ? 'DAMAGED' : `${bin.current_fill_percent}% Full`}
                        </span>
                      </div>

                      <div>
                        <div className="text-xs font-semibold text-slate-800">{bin.location_name}</div>
                        <div className="text-[10px] text-slate-400 mt-0.5">
                          Coordinates: {bin.latitude.toFixed(4)}, {bin.longitude.toFixed(4)}
                        </div>
                      </div>

                      {/* Fill capacity bar */}
                      <div className="space-y-1">
                        <div className="flex justify-between text-[10px] font-bold text-slate-600">
                          <span>Current Fill</span>
                          <span>{bin.current_fill_percent}%</span>
                        </div>
                        <div className="w-full bg-slate-100 rounded-full h-2 overflow-hidden">
                          <div
                            className={`h-full transition-all duration-300 ${
                              bin.current_fill_percent >= 80
                                ? 'bg-rose-500'
                                : bin.current_fill_percent >= 50
                                ? 'bg-amber-500'
                                : 'bg-emerald-500'
                            }`}
                            style={{ width: `${bin.current_fill_percent}%` }}
                          ></div>
                        </div>
                      </div>

                      {/* Report issue action button */}
                      <button
                        onClick={() => navigate(`/citizen/report?bin_id=${bin.id}`)}
                        className="w-full mt-2 py-1.5 px-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white rounded-lg text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-1.5 cursor-pointer"
                      >
                        <AlertTriangle className="h-3.5 w-3.5" /> Report Issue for this Bin
                      </button>
                    </div>
                  </Popup>
                </Marker>
              ))}
            </MapContainer>
          )}
        </div>
      </div>

      {/* Companion Card List */}
      <div>
        <div className="flex items-center justify-between mb-3">
          <h3 className="text-sm font-bold text-slate-900 uppercase tracking-wider">
            All Monitored Bins ({filteredBins.length})
          </h3>
        </div>

        <div className="grid grid-cols-1 sm:grid-cols-2 md:grid-cols-3 lg:grid-cols-4 gap-3.5">
          {filteredBins.map((bin) => {
            const isFull = bin.current_fill_percent >= 80;
            const isDamaged = bin.status === 'damaged';

            return (
              <div
                key={bin.id}
                className="bg-white p-4 rounded-xl border border-slate-200 hover:border-slate-300 shadow-xs flex flex-col justify-between gap-3 transition-all"
              >
                <div>
                  <div className="flex items-center justify-between gap-2">
                    <span className="font-extrabold text-xs text-slate-900">{bin.bin_code}</span>
                    <span
                      className={`text-[10px] font-black px-2 py-0.5 rounded-full ${
                        isDamaged
                          ? 'bg-slate-100 text-slate-700'
                          : isFull
                          ? 'bg-rose-100 text-rose-800'
                          : 'bg-emerald-100 text-emerald-800'
                      }`}
                    >
                      {isDamaged ? 'DAMAGED' : `${bin.current_fill_percent}% FULL`}
                    </span>
                  </div>
                  <p className="text-xs text-slate-600 font-medium mt-1 truncate" title={bin.location_name}>
                    {bin.location_name}
                  </p>
                </div>

                <div className="space-y-2">
                  <div className="w-full bg-slate-100 rounded-full h-1.5 overflow-hidden">
                    <div
                      className={`h-full ${
                        isDamaged
                          ? 'bg-slate-400'
                          : isFull
                          ? 'bg-rose-500'
                          : bin.current_fill_percent >= 50
                          ? 'bg-amber-500'
                          : 'bg-emerald-500'
                      }`}
                      style={{ width: `${bin.current_fill_percent}%` }}
                    ></div>
                  </div>

                  <button
                    onClick={() => navigate(`/citizen/report?bin_id=${bin.id}`)}
                    className="w-full py-1.5 px-2 bg-slate-50 hover:bg-emerald-50 hover:text-emerald-700 hover:border-emerald-200 border border-slate-200 text-slate-700 text-[11px] font-bold rounded-lg transition-colors flex items-center justify-center gap-1"
                  >
                    <span>Report Issue</span>
                    <ArrowRight className="h-3 w-3" />
                  </button>
                </div>
              </div>
            );
          })}
        </div>
      </div>
    </div>
  );
}
