import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import {
  X,
  Truck,
  Check,
  AlertCircle,
  Fuel,
  Gauge,
  User,
  ShieldCheck,
  Search,
  Sparkles
} from 'lucide-react';

export default function AssignVehicleModal({ isOpen, onClose, driver, onAssigned }) {
  const [vehicles, setVehicles] = useState([]);
  const [loading, setLoading] = useState(false);
  const [selectedVehicleId, setSelectedVehicleId] = useState(driver?.assigned_vehicle_id || '');
  const [search, setSearch] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    if (!isOpen) return;

    setSelectedVehicleId(driver?.assigned_vehicle_id || '');
    setError('');

    const fetchVehicles = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/vehicles');
        if (res.ok) {
          const data = await res.json();
          setVehicles(data);
        }
      } catch (err) {
        console.error('Error fetching vehicles:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchVehicles();
  }, [isOpen, driver]);

  if (!isOpen || !driver) return null;

  const handleAssign = async (vehicleIdToAssign) => {
    try {
      setSubmitting(true);
      setError('');

      const res = await apiFetch(`/api/drivers/${driver.id}/assign-vehicle`, {
        method: 'POST',
        body: JSON.stringify({ vehicle_id: vehicleIdToAssign || null })
      });

      const data = await res.json();
      if (!res.ok) {
        throw new Error(data.error || 'Failed to assign vehicle');
      }

      if (onAssigned) {
        onAssigned(data.driver);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Filter vehicles
  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      v.plate_number?.toLowerCase().includes(search.toLowerCase()) ||
      v.model?.toLowerCase().includes(search.toLowerCase()) ||
      v.fuel_type?.toLowerCase().includes(search.toLowerCase());
    return matchesSearch;
  });

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-white flex flex-col max-h-[90vh]">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 p-6 text-white flex items-center justify-between border-b border-slate-700/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-blue-500/20 border border-blue-400/30 flex items-center justify-center text-blue-300">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Assign Vehicle to Driver</h2>
              <p className="text-xs text-slate-300">
                Pairing Driver: <strong className="text-white">{driver.name}</strong> ({driver.email})
              </p>
            </div>
          </div>

          <button
            type="button"
            onClick={onClose}
            className="p-2 rounded-xl text-slate-400 hover:text-white hover:bg-white/10 transition-colors"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Search & Notice Bar */}
        <div className="p-5 border-b border-slate-100 dark:border-slate-800 space-y-3 shrink-0">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="flex items-center justify-between gap-3">
            <div className="relative flex-1">
              <Search className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search by plate number, model, or fuel..."
                className="w-full pl-9 pr-3 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs outline-none focus:border-blue-500"
              />
            </div>

            {driver.assigned_vehicle_id && (
              <button
                type="button"
                onClick={() => handleAssign(null)}
                disabled={submitting}
                className="text-xs font-bold text-rose-600 hover:text-rose-700 bg-rose-50 dark:bg-rose-950/40 hover:bg-rose-100 px-3 py-2 rounded-xl border border-rose-200 dark:border-rose-800 transition-colors cursor-pointer shrink-0"
              >
                Unassign Current Vehicle
              </button>
            )}
          </div>
        </div>

        {/* Vehicle List */}
        <div className="p-5 overflow-y-auto space-y-2.5 flex-1">
          {loading ? (
            <div className="py-12 text-center text-xs text-slate-400">Loading fleet vehicles...</div>
          ) : filteredVehicles.length === 0 ? (
            <div className="py-12 text-center text-xs text-slate-400">No matching fleet vehicles found.</div>
          ) : (
            filteredVehicles.map((v) => {
              const isCurrent = driver.assigned_vehicle_id === v.id;
              const isAssignedToOther = v.driver_id && v.driver_id !== driver.id;

              return (
                <div
                  key={v.id}
                  onClick={() => setSelectedVehicleId(v.id)}
                  className={`p-3.5 rounded-2xl border transition-all cursor-pointer flex items-center justify-between ${
                    selectedVehicleId === v.id
                      ? 'bg-blue-50/80 dark:bg-blue-950/50 border-blue-500 shadow-md ring-2 ring-blue-500/20'
                      : 'bg-slate-50/60 dark:bg-slate-800/40 border-slate-200/80 dark:border-slate-800 hover:border-slate-300'
                  }`}
                >
                  <div className="flex items-center gap-3">
                    <div className={`w-10 h-10 rounded-xl flex items-center justify-center font-bold text-xs ${
                      selectedVehicleId === v.id
                        ? 'bg-blue-600 text-white'
                        : 'bg-slate-200 dark:bg-slate-700 text-slate-700 dark:text-slate-300'
                    }`}>
                      <Truck className="w-5 h-5" />
                    </div>

                    <div>
                      <div className="flex items-center gap-2">
                        <span className="font-mono font-black text-sm text-slate-900 dark:text-white">
                          {v.plate_number}
                        </span>
                        {isCurrent && (
                          <span className="text-[10px] font-black bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 px-2 py-0.5 rounded-full uppercase">
                            Currently Assigned
                          </span>
                        )}
                        {isAssignedToOther && (
                          <span className="text-[10px] font-bold bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 px-2 py-0.5 rounded-full">
                            Assigned to {v.driver_name}
                          </span>
                        )}
                      </div>

                      <div className="text-xs text-slate-500 dark:text-slate-400 mt-0.5 flex items-center gap-3">
                        <span>{v.model}</span>
                        <span>•</span>
                        <span>{v.fuel_type}</span>
                        <span>•</span>
                        <span>{v.avg_mileage_kmpl} km/L</span>
                      </div>
                    </div>
                  </div>

                  <button
                    type="button"
                    onClick={(e) => {
                      e.stopPropagation();
                      handleAssign(v.id);
                    }}
                    disabled={submitting}
                    className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer ${
                      isCurrent
                        ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300'
                        : 'bg-blue-600 hover:bg-blue-700 text-white shadow-xs'
                    }`}
                  >
                    {isCurrent ? 'Current' : 'Assign'}
                  </button>
                </div>
              );
            })
          )}
        </div>

        {/* Footer */}
        <div className="p-5 bg-slate-50 dark:bg-slate-800/50 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between shrink-0">
          <div className="text-xs text-slate-400">
            Selecting a vehicle pairs it with driver <strong>{driver.name}</strong> for live dispatch.
          </div>

          <div className="flex items-center gap-2">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-200 dark:hover:bg-slate-700 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            {selectedVehicleId && selectedVehicleId !== driver.assigned_vehicle_id && (
              <button
                type="button"
                onClick={() => handleAssign(selectedVehicleId)}
                disabled={submitting}
                className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white text-xs font-black rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
              >
                {submitting ? 'Assigning...' : 'Confirm Assignment'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
