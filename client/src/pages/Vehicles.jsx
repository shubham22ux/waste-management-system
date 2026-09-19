import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { useSocket } from '../context/SocketContext';
import AddVehicleModal from '../components/AddVehicleModal';
import AssignVehicleModal from '../components/AssignVehicleModal';
import {
  Truck,
  Plus,
  Trash2,
  Search,
  CheckCircle2,
  AlertTriangle,
  Wrench,
  Fuel,
  Gauge,
  User,
  Shield,
  RefreshCw,
  Sparkles,
  Layers,
  ArrowRight,
  Clock,
  Check,
  X
} from 'lucide-react';

export default function Vehicles() {
  const { socket } = useSocket();

  const [vehicles, setVehicles] = useState([]);
  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');

  // Modals
  const [isAddVehicleOpen, setIsAddVehicleOpen] = useState(false);
  const [assignModal, setAssignModal] = useState({
    isOpen: false,
    driver: null
  });

  // Delete confirmation modal state
  const [deleteConfirm, setDeleteConfirm] = useState({
    isOpen: false,
    vehicle: null,
    submitting: false
  });

  // Toast feedback
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  // Fetch vehicles and drivers
  const fetchData = async () => {
    try {
      setLoading(true);
      const [vRes, dRes] = await Promise.all([
        apiFetch('/api/vehicles'),
        apiFetch('/api/drivers')
      ]);

      if (vRes.ok) {
        const vData = await vRes.json();
        setVehicles(vData);
      }
      if (dRes.ok) {
        const dData = await dRes.json();
        setDrivers(dData);
      }
    } catch (err) {
      console.error('Error fetching fleet data:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchData();
  }, []);

  // Listen for live Socket.IO events
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = () => {
      fetchData();
    };

    socket.on('vehicle:created', handleUpdate);
    socket.on('vehicle:updated', handleUpdate);
    socket.on('vehicle:deleted', handleUpdate);
    socket.on('driver:updated', handleUpdate);

    return () => {
      socket.off('vehicle:created', handleUpdate);
      socket.off('vehicle:updated', handleUpdate);
      socket.off('vehicle:deleted', handleUpdate);
      socket.off('driver:updated', handleUpdate);
    };
  }, [socket]);

  // Execute vehicle deletion
  const handleDeleteVehicle = async () => {
    if (!deleteConfirm.vehicle) return;

    try {
      setDeleteConfirm((prev) => ({ ...prev, submitting: true }));
      const res = await apiFetch(`/api/vehicles/${deleteConfirm.vehicle.id}`, {
        method: 'DELETE'
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to delete vehicle');
      }

      const unassignedText = data.unassignedDrivers?.length > 0
        ? ` Driver ${data.unassignedDrivers[0].name} is now unassigned.`
        : '';

      showToast(`Vehicle ${deleteConfirm.vehicle.plate_number} deleted successfully.${unassignedText}`);
      setDeleteConfirm({ isOpen: false, vehicle: null, submitting: false });
      fetchData();
    } catch (err) {
      alert('Error: ' + err.message);
      setDeleteConfirm((prev) => ({ ...prev, submitting: false }));
    }
  };

  // Filtered vehicles
  const filteredVehicles = vehicles.filter((v) => {
    const matchesSearch =
      v.plate_number?.toLowerCase().includes(search.toLowerCase()) ||
      v.model?.toLowerCase().includes(search.toLowerCase()) ||
      v.driver_name?.toLowerCase().includes(search.toLowerCase()) ||
      v.fuel_type?.toLowerCase().includes(search.toLowerCase());

    const matchesStatus = statusFilter === 'all' || v.status === statusFilter;

    return matchesSearch && matchesStatus;
  });

  // KPI calculations
  const totalVehicles = vehicles.length;
  const availableVehicles = vehicles.filter((v) => v.status === 'available').length;
  const maintenanceVehicles = vehicles.filter((v) => v.status === 'maintenance').length;
  const unassignedDrivers = drivers.filter((d) => !d.assigned_vehicle_id);

  return (
    <div className="w-full space-y-6 pb-16 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[99999] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-teal-500/50 text-sm animate-in slide-in-from-top-3">
          <CheckCircle2 className="w-5 h-5 text-teal-400 shrink-0" />
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      {/* Hero Header */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 rounded-3xl p-6 sm:p-7 text-white shadow-xl border border-slate-700/40 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-teal-400 uppercase tracking-widest mb-1.5">
            <Truck className="h-4 w-4" /> Municipal Fleet Inventory
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Fleet Vehicle Management
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            Manage municipal waste trucks, fuel ratings, and driver pairings. Deleting a vehicle automatically frees the driver so you can assign another vehicle.
          </p>
        </div>

        <div className="flex items-center gap-3 shrink-0">
          <button
            type="button"
            onClick={fetchData}
            title="Refresh fleet"
            className="p-3 rounded-2xl bg-white/10 hover:bg-white/20 text-white transition-colors"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin' : ''}`} />
          </button>

          <button
            type="button"
            onClick={() => setIsAddVehicleOpen(true)}
            className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 active:from-teal-700 text-white font-black text-xs sm:text-sm px-5 py-3 rounded-2xl shadow-lg transition-all cursor-pointer hover:shadow-teal-500/25"
          >
            <Plus className="w-4 h-4" />
            <span>Add New Vehicle</span>
          </button>
        </div>
      </div>

      {/* KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        {/* Total Vehicles */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Vehicles</div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">{totalVehicles}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Registered fleet trucks</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        {/* Available Vehicles */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available</div>
            <div className="text-3xl font-black text-teal-600 dark:text-teal-400 mt-1">{availableVehicles}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Ready for dispatch</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-teal-100/70 dark:bg-teal-900/40 text-teal-600 dark:text-teal-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        {/* Maintenance */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Maintenance</div>
            <div className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">{maintenanceVehicles}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">In service garage</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100/70 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Wrench className="w-6 h-6" />
          </div>
        </div>

        {/* Drivers Needing Vehicle */}
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Unassigned Drivers</div>
            <div className="text-3xl font-black text-rose-600 dark:text-rose-400 mt-1">{unassignedDrivers.length}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Need vehicle assignment</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-rose-100/70 dark:bg-rose-900/40 text-rose-600 dark:text-rose-400 flex items-center justify-center">
            <AlertTriangle className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Search & Filter Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col sm:flex-row items-center justify-between gap-3">
        <div className="relative w-full sm:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search plate, model, driver..."
            className="w-full pl-10 pr-4 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-200 dark:border-slate-700 rounded-xl text-xs sm:text-sm outline-none focus:border-teal-500 focus:bg-white dark:focus:bg-slate-900 transition-all text-slate-900 dark:text-white"
          />
        </div>

        {/* Status Filter Tabs */}
        <div className="flex items-center gap-1.5 overflow-x-auto w-full sm:w-auto pb-1 sm:pb-0">
          {[
            { id: 'all', label: 'All Fleet' },
            { id: 'available', label: 'Available' },
            { id: 'on_route', label: 'On Route' },
            { id: 'maintenance', label: 'Maintenance' }
          ].map((tab) => (
            <button
              key={tab.id}
              type="button"
              onClick={() => setStatusFilter(tab.id)}
              className={`px-3 py-1.5 rounded-xl text-xs font-black transition-all cursor-pointer whitespace-nowrap ${
                statusFilter === tab.id
                  ? 'bg-teal-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {tab.label}
            </button>
          ))}
        </div>
      </div>

      {/* Vehicle Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {loading ? (
          <div className="col-span-full py-16 text-center text-slate-400 text-sm">
            Loading municipal fleet inventory...
          </div>
        ) : filteredVehicles.length === 0 ? (
          <div className="col-span-full py-16 bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 text-center space-y-3">
            <Truck className="w-12 h-12 text-slate-300 mx-auto" />
            <div className="font-bold text-slate-700 dark:text-slate-300">No vehicles found matching criteria</div>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting your search terms or register a new truck into the fleet.
            </p>
          </div>
        ) : (
          filteredVehicles.map((vehicle) => {
            const hasDriver = !!vehicle.driver_id;
            const assignedDriverObj = drivers.find((d) => d.id === vehicle.driver_id);

            return (
              <div
                key={vehicle.id}
                className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-5 shadow-xs hover:shadow-md transition-all space-y-4 flex flex-col justify-between"
              >
                <div>
                  {/* Top Header: Plate & Status */}
                  <div className="flex items-start justify-between gap-3">
                    <div className="flex items-center gap-3">
                      <div className="w-11 h-11 rounded-2xl bg-teal-50 dark:bg-teal-950/60 border border-teal-200 dark:border-teal-800/80 text-teal-600 dark:text-teal-400 flex items-center justify-center font-bold text-sm">
                        <Truck className="w-5 h-5" />
                      </div>
                      <div>
                        <div className="font-mono font-black text-base text-slate-900 dark:text-white">
                          {vehicle.plate_number}
                        </div>
                        <div className="text-xs text-slate-500 dark:text-slate-400 font-medium">
                          {vehicle.model}
                        </div>
                      </div>
                    </div>

                    <span
                      className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                        vehicle.status === 'available'
                          ? 'bg-emerald-100 text-emerald-800 dark:bg-emerald-950 dark:text-emerald-300 border border-emerald-200'
                          : vehicle.status === 'on_route'
                          ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200'
                          : 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200'
                      }`}
                    >
                      {vehicle.status}
                    </span>
                  </div>

                  {/* Vehicle Specs Pill Box */}
                  <div className="grid grid-cols-3 gap-2 mt-4 p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 text-center">
                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1">
                        <Fuel className="w-3 h-3 text-teal-600" /> Fuel
                      </div>
                      <div className="text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">
                        {vehicle.fuel_type}
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1">
                        <Gauge className="w-3 h-3 text-teal-600" /> Tank
                      </div>
                      <div className="text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">
                        {vehicle.tank_capacity} L
                      </div>
                    </div>

                    <div>
                      <div className="text-[10px] font-bold text-slate-400 uppercase tracking-wider flex items-center justify-center gap-1">
                        <Sparkles className="w-3 h-3 text-teal-600" /> Mileage
                      </div>
                      <div className="text-xs font-black text-slate-800 dark:text-slate-200 mt-0.5">
                        {vehicle.avg_mileage_kmpl} km/L
                      </div>
                    </div>
                  </div>

                  {/* Assigned Driver Status Card */}
                  <div className="mt-4 p-3.5 rounded-2xl border transition-all text-xs space-y-2 bg-slate-50/70 dark:bg-slate-800/50 border-slate-200/80 dark:border-slate-800">
                    <div className="flex items-center justify-between">
                      <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider">
                        Assigned Driver
                      </span>
                      {hasDriver && (
                        <span className="text-[10px] font-bold text-teal-600 dark:text-teal-400 bg-teal-50 dark:bg-teal-950/60 px-2 py-0.5 rounded-md">
                          Paired
                        </span>
                      )}
                    </div>

                    {hasDriver ? (
                      <div className="flex items-center justify-between">
                        <div className="flex items-center gap-2.5">
                          <div className="w-7 h-7 rounded-full bg-teal-100 text-teal-700 font-bold flex items-center justify-center text-xs">
                            {vehicle.driver_name ? vehicle.driver_name.charAt(0) : 'D'}
                          </div>
                          <div>
                            <div className="font-black text-slate-900 dark:text-white">
                              {vehicle.driver_name}
                            </div>
                            <div className="text-[11px] text-slate-400">
                              {vehicle.driver_phone || vehicle.driver_email || 'No phone'}
                            </div>
                          </div>
                        </div>

                        {assignedDriverObj && (
                          <button
                            type="button"
                            onClick={() => setAssignModal({ isOpen: true, driver: assignedDriverObj })}
                            className="text-[11px] font-bold text-teal-600 hover:text-teal-700 bg-teal-50 dark:bg-teal-950/50 hover:bg-teal-100 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Change
                          </button>
                        )}
                      </div>
                    ) : (
                      <div className="flex items-center justify-between py-1 text-slate-500 dark:text-slate-400">
                        <span className="italic text-[11px]">No driver currently assigned (Idle)</span>
                        {unassignedDrivers.length > 0 && (
                          <button
                            type="button"
                            onClick={() => setAssignModal({ isOpen: true, driver: unassignedDrivers[0] })}
                            className="text-[11px] font-black text-white bg-teal-600 hover:bg-teal-700 px-2.5 py-1 rounded-lg transition-colors cursor-pointer"
                          >
                            Assign Driver
                          </button>
                        )}
                      </div>
                    )}
                  </div>
                </div>

                {/* Footer Action: Delete Vehicle */}
                <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between">
                  <div className="text-[11px] text-slate-400">
                    ID #{vehicle.id} • Registered
                  </div>

                  <button
                    type="button"
                    onClick={() => setDeleteConfirm({ isOpen: true, vehicle, submitting: false })}
                    className="inline-flex items-center gap-1.5 text-xs font-bold text-rose-600 dark:text-rose-400 hover:text-rose-700 hover:bg-rose-50 dark:hover:bg-rose-950/50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                    title="Delete this vehicle from fleet"
                  >
                    <Trash2 className="w-3.5 h-3.5" />
                    <span>Delete Vehicle</span>
                  </button>
                </div>
              </div>
            );
          })
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. ADD NEW VEHICLE MODAL                                                  */}
      {/* ========================================================================= */}
      <AddVehicleModal
        isOpen={isAddVehicleOpen}
        onClose={() => setIsAddVehicleOpen(false)}
        onVehicleCreated={(newVehicle) => {
          showToast(`Vehicle ${newVehicle.plate_number} added to fleet!`);
          fetchData();
        }}
      />

      {/* ========================================================================= */}
      {/* 2. ASSIGN VEHICLE MODAL                                                   */}
      {/* ========================================================================= */}
      {assignModal.isOpen && assignModal.driver && (
        <AssignVehicleModal
          isOpen={assignModal.isOpen}
          onClose={() => setAssignModal({ isOpen: false, driver: null })}
          driver={assignModal.driver}
          onAssigned={(updatedDriver) => {
            showToast(`Driver ${updatedDriver.name} updated!`);
            fetchData();
          }}
        />
      )}

      {/* ========================================================================= */}
      {/* 3. DELETE VEHICLE CONFIRMATION MODAL                                      */}
      {/* ========================================================================= */}
      {deleteConfirm.isOpen && deleteConfirm.vehicle && (
        <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
          <div className="bg-white dark:bg-slate-900 w-full max-w-md rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-white p-6 space-y-4">
            <div className="w-12 h-12 rounded-2xl bg-rose-100 dark:bg-rose-950/70 text-rose-600 dark:text-rose-400 flex items-center justify-center mx-auto">
              <Trash2 className="w-6 h-6" />
            </div>

            <div className="text-center space-y-2">
              <h3 className="text-lg font-black text-slate-900 dark:text-white">
                Delete Vehicle {deleteConfirm.vehicle.plate_number}?
              </h3>
              <p className="text-xs text-slate-500 dark:text-slate-400 leading-relaxed">
                Are you sure you want to permanently remove this vehicle ({deleteConfirm.vehicle.model}) from the municipal fleet?
              </p>

              {deleteConfirm.vehicle.driver_name ? (
                <div className="p-3 bg-amber-50 dark:bg-amber-950/40 border border-amber-200 dark:border-amber-800 rounded-xl text-left text-xs space-y-1">
                  <div className="font-bold text-amber-900 dark:text-amber-200 flex items-center gap-1.5">
                    <AlertTriangle className="w-4 h-4 text-amber-600 shrink-0" />
                    <span>Driver Unassignment Notice</span>
                  </div>
                  <p className="text-[11px] text-amber-800 dark:text-amber-300">
                    Driver <strong>{deleteConfirm.vehicle.driver_name}</strong> is currently assigned to this vehicle.
                    Deleting it will <strong>automatically unassign</strong> the driver, and you will have the option to assign them another vehicle.
                  </p>
                </div>
              ) : (
                <div className="text-[11px] text-slate-400 italic">
                  This vehicle has no driver assigned.
                </div>
              )}
            </div>

            <div className="pt-2 flex items-center justify-center gap-3">
              <button
                type="button"
                onClick={() => setDeleteConfirm({ isOpen: false, vehicle: null, submitting: false })}
                disabled={deleteConfirm.submitting}
                className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
              >
                Cancel
              </button>

              <button
                type="button"
                onClick={handleDeleteVehicle}
                disabled={deleteConfirm.submitting}
                className="px-5 py-2.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-black rounded-xl shadow-lg transition-all cursor-pointer disabled:opacity-50 flex items-center gap-2"
              >
                <Trash2 className="w-4 h-4" />
                <span>{deleteConfirm.submitting ? 'Deleting...' : 'Confirm Delete'}</span>
              </button>
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
