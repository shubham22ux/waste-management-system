import React, { useEffect, useState, useMemo } from 'react';
import { MapContainer, TileLayer, Marker, Popup, Polyline, useMap } from 'react-leaflet';
import L from 'leaflet';
import { apiFetch } from '../api';
import {
  X,
  Truck,
  Phone,
  Navigation,
  CheckCircle,
  AlertCircle,
  MapPin,
  Clock,
  Sparkles,
  Image as ImageIcon
} from 'lucide-react';

// Leaflet map auto-fitter helper
function MapBoundsUpdater({ bin, drivers, selectedDriver }) {
  const map = useMap();

  useEffect(() => {
    if (!map) return;
    map.invalidateSize();

    const points = [];
    if (bin?.latitude && bin?.longitude) {
      points.push([Number(bin.latitude), Number(bin.longitude)]);
    }

    if (selectedDriver?.currentLatitude && selectedDriver?.currentLongitude) {
      points.push([Number(selectedDriver.currentLatitude), Number(selectedDriver.currentLongitude)]);
    } else if (drivers && drivers.length > 0) {
      drivers.forEach((d) => {
        if (d.currentLatitude && d.currentLongitude) {
          points.push([Number(d.currentLatitude), Number(d.currentLongitude)]);
        }
      });
    }

    if (points.length === 1) {
      map.setView(points[0], 14);
    } else if (points.length > 1) {
      const bounds = L.latLngBounds(points);
      map.fitBounds(bounds, { padding: [35, 35], maxZoom: 15 });
    }
  }, [map, bin, drivers, selectedDriver]);

  return null;
}

const createBinMarkerIcon = (fillPercent) => {
  const color = fillPercent >= 80 ? '#ef4444' : fillPercent >= 50 ? '#f97316' : '#10b981';
  return L.divIcon({
    className: 'modal-bin-icon',
    html: `
      <div style="position: relative; width: 34px; height: 34px; display: flex; align-items: center; justify-content: center;">
        <div style="position: absolute; width: 38px; height: 38px; border-radius: 50%; background-color: ${color}; opacity: 0.3; animation: ping 1.5s infinite;"></div>
        <div style="width: 32px; height: 32px; border-radius: 50%; background-color: ${color}; border: 2.5px solid #ffffff; box-shadow: 0 4px 8px rgba(0,0,0,0.3); display: flex; align-items: center; justify-content: center; color: #ffffff; font-size: 11px; font-weight: 800;">
          ${fillPercent}%
        </div>
      </div>
    `,
    iconSize: [34, 34],
    iconAnchor: [17, 17]
  });
};

const createDriverMarkerIcon = (isSelected, isNearest) => {
  const bgColor = isSelected ? '#10b981' : '#2563eb';
  return L.divIcon({
    className: 'modal-driver-icon',
    html: `
      <div style="position: relative; width: 32px; height: 32px; display: flex; align-items: center; justify-content: center;">
        <div style="width: 30px; height: 30px; border-radius: 50%; background-color: ${bgColor}; border: 2.5px solid #ffffff; box-shadow: 0 4px 6px rgba(0,0,0,0.35); display: flex; align-items: center; justify-content: center; color: #ffffff;">
          <svg xmlns="http://www.w3.org/2000/svg" width="16" height="16" viewBox="0 0 24 24" fill="none" stroke="#ffffff" stroke-width="2.2" stroke-linecap="round" stroke-linejoin="round">
            <path d="M14 18V6a2 2 0 0 0-2-2H4a2 2 0 0 0-2 2v11a1 1 0 0 0 1 1h2"/>
            <path d="M15 18H9"/>
            <path d="M19 18h2a1 1 0 0 0 1-1v-3.65a1 1 0 0 0-.22-.624l-3.48-4.35A1 1 0 0 0 17.52 8H14"/>
            <circle cx="17" cy="18" r="2"/>
            <circle cx="7" cy="18" r="2"/>
          </svg>
        </div>
      </div>
    `,
    iconSize: [32, 32],
    iconAnchor: [16, 16]
  });
};

export default function AssignDriverModal({
  isOpen,
  onClose,
  bin,
  requestId,
  complaint,
  onAssigned
}) {
  const [drivers, setDrivers] = useState([]);
  const [selectedDriverId, setSelectedDriverId] = useState(null);
  const [loadingDrivers, setLoadingDrivers] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [errorMsg, setErrorMsg] = useState(null);

  // Fetch nearest available drivers whenever modal opens with a valid bin
  useEffect(() => {
    if (!isOpen || !bin?.id) {
      setDrivers([]);
      setSelectedDriverId(null);
      setErrorMsg(null);
      return;
    }

    const fetchNearestDrivers = async () => {
      try {
        setLoadingDrivers(true);
        setErrorMsg(null);
        const res = await apiFetch(`/api/drivers/nearest?binId=${bin.id}`);
        if (!res.ok) {
          const err = await res.json();
          throw new Error(err.error || 'Failed to fetch nearest drivers');
        }
        const data = await res.json();
        setDrivers(data);
        if (data.length > 0) {
          setSelectedDriverId(data[0].id); // Pre-select nearest driver
        }
      } catch (err) {
        console.error('Error fetching nearest drivers:', err);
        setErrorMsg(err.message);
      } finally {
        setLoadingDrivers(false);
      }
    };

    fetchNearestDrivers();
  }, [isOpen, bin?.id]);

  if (!isOpen || !bin) return null;

  const selectedDriver = drivers.find((d) => d.id === selectedDriverId) || (drivers.length > 0 ? drivers[0] : null);

  const complaintPhoto = complaint?.photo_url || bin.complaint_photo || null;

  const handleConfirmAssignment = async () => {
    if (!selectedDriverId) {
      alert('Please select a driver to assign.');
      return;
    }

    try {
      setSubmitting(true);
      setErrorMsg(null);

      let res;
      if (requestId) {
        // Direct assignment to existing collection request
        res = await apiFetch(`/api/requests/${requestId}/assign`, {
          method: 'POST',
          body: JSON.stringify({ driver_id: selectedDriverId })
        });
      } else {
        // Assign to bin (will find pending request or create one)
        res = await apiFetch('/api/requests/assign-bin', {
          method: 'POST',
          body: JSON.stringify({
            bin_id: bin.id,
            driver_id: selectedDriverId,
            complaint_id: complaint?.id || bin.complaint_id || null,
            source: complaint?.id ? 'complaint' : 'manual'
          })
        });
      }

      const result = await res.json();
      if (!res.ok) {
        throw new Error(result.error || 'Failed to assign driver');
      }

      if (onAssigned) {
        onAssigned(result);
      }
      onClose();
    } catch (err) {
      console.error('Assignment error:', err);
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleUnassignDriver = async () => {
    try {
      setSubmitting(true);
      setErrorMsg(null);
      let res;
      if (requestId) {
        res = await apiFetch(`/api/requests/${requestId}/unassign`, { method: 'POST' });
      } else if (complaint?.id) {
        res = await apiFetch(`/api/complaints/${complaint.id}/unassign`, { method: 'POST' });
      } else if (bin?.id) {
        // Find if there is an active request on this bin to unassign
        const reqsRes = await apiFetch('/api/requests');
        if (reqsRes.ok) {
          const allReqs = await reqsRes.json();
          const targetReq = allReqs.find((r) => r.bin_id === bin.id && r.status === 'assigned');
          if (targetReq) {
            res = await apiFetch(`/api/requests/${targetReq.id}/unassign`, { method: 'POST' });
          }
        }
      }

      if (res) {
        const result = await res.json();
        if (!res.ok) throw new Error(result.error || 'Failed to unassign driver');
        if (onAssigned) onAssigned(result);
        onClose();
      } else {
        throw new Error('No active assigned request found to unassign.');
      }
    } catch (err) {
      console.error('Unassign error:', err);
      setErrorMsg(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const binPosition = [Number(bin.latitude || 12.9716), Number(bin.longitude || 77.5946)];
  const driverPosition = selectedDriver?.currentLatitude && selectedDriver?.currentLongitude
    ? [Number(selectedDriver.currentLatitude), Number(selectedDriver.currentLongitude)]
    : null;

  const currentAssignedName = bin.driver_name || complaint?.assigned_driver_name;
  const isCurrentlyAssigned = !!(currentAssignedName || bin.assigned_driver_id || complaint?.assigned_driver_id);

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-3 sm:p-4 bg-slate-900/70 backdrop-blur-xs animate-in fade-in duration-200">
      <div className="bg-white rounded-3xl shadow-2xl border border-slate-200 w-full max-w-2xl overflow-hidden flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-slate-100 bg-slate-50/80">
          <div className="flex items-center gap-2.5">
            <div className="w-9 h-9 rounded-xl bg-blue-600/10 text-blue-600 flex items-center justify-center">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-bold text-slate-900 leading-tight">
                {isCurrentlyAssigned ? 'Reassign or Unassign Driver' : 'Assign Collection Driver'}
              </h2>
              <p className="text-xs text-slate-500">Pick the optimal field crew for immediate dispatch</p>
            </div>
          </div>
          <button
            onClick={onClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 hover:bg-slate-200/50 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Scrollable Body */}
        <div className="p-6 overflow-y-auto space-y-5">
          {errorMsg && (
            <div className="p-3 bg-rose-50 border border-rose-200 rounded-2xl flex items-center gap-2.5 text-rose-700 text-xs">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{errorMsg}</span>
            </div>
          )}

          {/* Current Assignment Banner */}
          {isCurrentlyAssigned && (
            <div className="p-3 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between text-xs text-blue-900">
              <div className="flex items-center gap-2">
                <Truck className="w-4 h-4 text-blue-600" />
                <span>
                  Currently Assigned: <strong>{currentAssignedName || 'Driver Assigned'}</strong>
                </span>
              </div>
              <button
                type="button"
                onClick={handleUnassignDriver}
                disabled={submitting}
                className="text-xs font-black text-rose-600 hover:text-rose-700 bg-rose-50 hover:bg-rose-100 px-3 py-1 rounded-xl border border-rose-200 transition-colors cursor-pointer"
              >
                Unassign Driver
              </button>
            </div>
          )}

          {/* Bin Details Card */}
          <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 flex flex-col sm:flex-row gap-4 justify-between items-start sm:items-center">
            <div className="space-y-1">
              <div className="flex items-center gap-2">
                <span className="font-extrabold text-slate-900 text-sm">{bin.bin_code}</span>
                <span
                  className={`text-[11px] font-bold px-2 py-0.5 rounded-full border ${
                    bin.current_fill_percent >= 80
                      ? 'bg-rose-100 text-rose-700 border-rose-200'
                      : bin.current_fill_percent >= 50
                      ? 'bg-amber-100 text-amber-700 border-amber-200'
                      : 'bg-emerald-100 text-emerald-700 border-emerald-200'
                  }`}
                >
                  {bin.current_fill_percent}% Full
                </span>
                {requestId && (
                  <span className="text-[10px] text-slate-500 bg-white px-2 py-0.5 rounded-full border border-slate-200 font-mono">
                    Req #{requestId}
                  </span>
                )}
              </div>
              <p className="text-xs text-slate-600 flex items-center gap-1.5">
                <MapPin className="w-3.5 h-3.5 text-slate-400 shrink-0" />
                {bin.location_name}
              </p>
            </div>

            {complaintPhoto && (
              <div className="flex items-center gap-2.5 bg-white p-2 rounded-xl border border-slate-200 shadow-2xs">
                <img
                  src={complaintPhoto}
                  alt="Complaint Photo"
                  className="w-12 h-12 rounded-lg object-cover border border-slate-200"
                />
                <div className="text-[11px]">
                  <p className="font-bold text-slate-800 flex items-center gap-1">
                    <ImageIcon className="w-3 h-3 text-blue-500" />
                    Complaint Photo
                  </p>
                  <p className="text-slate-500 text-[10px]">Reported by citizen</p>
                </div>
              </div>
            )}
          </div>

          {/* Mini Leaflet Map */}
          <div className="relative rounded-2xl overflow-hidden border border-slate-200 shadow-2xs h-48 bg-slate-100">
            <MapContainer
              center={binPosition}
              zoom={13}
              style={{ height: '100%', width: '100%' }}
              zoomControl={false}
              attributionControl={false}
            >
              <TileLayer
                url="https://{s}.basemaps.cartocdn.com/rastertiles/voyager/{z}/{x}/{y}{r}.png"
                maxZoom={19}
              />
              <MapBoundsUpdater bin={bin} drivers={drivers} selectedDriver={selectedDriver} />

              {/* Bin Marker */}
              <Marker position={binPosition} icon={createBinMarkerIcon(bin.current_fill_percent)}>
                <Popup>
                  <div className="text-xs">
                    <b>{bin.bin_code}</b> ({bin.current_fill_percent}%)
                    <br />
                    {bin.location_name}
                  </div>
                </Popup>
              </Marker>

              {/* Candidate Drivers Markers */}
              {drivers.map((d) => {
                if (!d.currentLatitude || !d.currentLongitude) return null;
                const isSelected = d.id === selectedDriverId;
                return (
                  <Marker
                    key={d.id}
                    position={[Number(d.currentLatitude), Number(d.currentLongitude)]}
                    icon={createDriverMarkerIcon(isSelected, d.isNearest)}
                    eventHandlers={{
                      click: () => setSelectedDriverId(d.id)
                    }}
                  >
                    <Popup>
                      <div className="text-xs">
                        <b>{d.name}</b> ({d.distanceKm} km away)
                        <br />
                        Plate: {d.vehicle_plate || 'Unassigned'}
                      </div>
                    </Popup>
                  </Marker>
                );
              })}

              {/* Trajectory Polyline connecting Bin and Selected Driver */}
              {driverPosition && (
                <Polyline
                  positions={[driverPosition, binPosition]}
                  color="#2563eb"
                  weight={3}
                  dashArray="6, 6"
                  opacity={0.8}
                />
              )}
            </MapContainer>

            {/* Map overlay badge */}
            <div className="absolute top-2.5 left-2.5 z-[1000] bg-white/90 backdrop-blur-xs px-2.5 py-1 rounded-lg border border-slate-200 text-[10px] font-semibold text-slate-700 shadow-xs flex items-center gap-1.5">
              <Navigation className="w-3 h-3 text-blue-600" />
              Live Candidate Positions & Proximity
            </div>
          </div>

          {/* Available Drivers List */}
          <div className="space-y-2">
            <div className="flex items-center justify-between">
              <label className="text-xs font-bold text-slate-700 uppercase tracking-wider">
                Available Drivers (Sorted Nearest First)
              </label>
              <span className="text-[11px] text-slate-500">
                {drivers.length} available {drivers.length === 1 ? 'driver' : 'drivers'}
              </span>
            </div>

            {loadingDrivers ? (
              <div className="py-8 text-center text-xs text-slate-400 flex items-center justify-center gap-2">
                <div className="w-4 h-4 border-2 border-blue-600 border-t-transparent rounded-full animate-spin"></div>
                Calculating nearest drivers...
              </div>
            ) : drivers.length === 0 ? (
              <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl text-amber-800 text-xs text-center">
                No drivers currently available with status &quot;available&quot;. All drivers may be busy or off duty.
              </div>
            ) : (
              <div className="space-y-2 max-h-56 overflow-y-auto pr-1">
                {drivers.map((driver) => {
                  const isSelected = driver.id === selectedDriverId;
                  return (
                    <div
                      key={driver.id}
                      onClick={() => setSelectedDriverId(driver.id)}
                      className={`p-3 rounded-2xl border transition-all cursor-pointer flex items-center justify-between gap-3 ${
                        isSelected
                          ? 'border-blue-500 bg-blue-50/60 shadow-xs ring-2 ring-blue-500/20'
                          : 'border-slate-200 hover:border-slate-300 hover:bg-slate-50/70 bg-white'
                      }`}
                    >
                      <div className="flex items-center gap-3">
                        <input
                          type="radio"
                          name="assignedDriver"
                          checked={isSelected}
                          onChange={() => setSelectedDriverId(driver.id)}
                          className="w-4 h-4 text-blue-600 border-slate-300 focus:ring-blue-500 cursor-pointer"
                        />
                        <div>
                          <div className="flex items-center gap-2">
                            <span className="text-xs font-bold text-slate-900">{driver.name}</span>
                            {driver.isNearest && (
                              <span className="inline-flex items-center gap-1 bg-emerald-100 text-emerald-800 border border-emerald-300 px-2 py-0.5 rounded-full text-[10px] font-extrabold tracking-wide">
                                <Sparkles className="w-2.5 h-2.5 text-emerald-600" />
                                Nearest
                              </span>
                            )}
                          </div>
                          <div className="flex items-center gap-3 text-[11px] text-slate-500 mt-0.5">
                            {driver.phone && (
                              <span className="flex items-center gap-1">
                                <Phone className="w-3 h-3 text-slate-400" />
                                {driver.phone}
                              </span>
                            )}
                            {driver.vehicle_plate && (
                              <span className="font-mono bg-slate-100 px-1.5 py-0.2 rounded text-[10px] text-slate-700">
                                {driver.vehicle_plate}
                              </span>
                            )}
                          </div>
                        </div>
                      </div>

                      <div className="text-right shrink-0">
                        <div className="text-xs font-extrabold text-blue-700">
                          {driver.distanceKm !== undefined ? `${driver.distanceKm} km` : '—'}
                        </div>
                        <div className="text-[10px] text-slate-400">from bin</div>
                      </div>
                    </div>
                  );
                })}
              </div>
            )}
          </div>
        </div>

        {/* Footer Actions */}
        <div className="px-6 py-4 border-t border-slate-100 bg-slate-50 flex items-center justify-end gap-2.5">
          <button
            type="button"
            onClick={onClose}
            disabled={submitting}
            className="px-4 py-2 rounded-xl border border-slate-200 text-xs font-bold text-slate-600 hover:bg-slate-200/60 transition-colors"
          >
            Cancel
          </button>
          <button
            type="button"
            onClick={handleConfirmAssignment}
            disabled={submitting || !selectedDriverId || drivers.length === 0}
            className="px-5 py-2 rounded-xl bg-blue-600 hover:bg-blue-700 disabled:opacity-50 disabled:cursor-not-allowed text-white text-xs font-bold transition-all shadow-xs flex items-center gap-1.5"
          >
            {submitting ? (
              <>
                <div className="w-3.5 h-3.5 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Assigning...
              </>
            ) : (
              <>
                <CheckCircle className="w-4 h-4" />
                Confirm Assignment
              </>
            )}
          </button>
        </div>
      </div>
    </div>
  );
}
