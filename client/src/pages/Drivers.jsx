import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import { useSocket } from '../context/SocketContext';
import AddDriverModal from '../components/AddDriverModal';
import AssignVehicleModal from '../components/AssignVehicleModal';
import {
  Users,
  Truck,
  Plus,
  KeyRound,
  Shield,
  Phone,
  CreditCard,
  Search,
  CheckCircle2,
  Clock,
  Trash2,
  Edit2,
  Copy,
  Check,
  Sparkles,
  AlertCircle,
  AlertTriangle,
  RefreshCw,
  X,
  Eye,
  EyeOff
} from 'lucide-react';

export default function Drivers() {
  const { socket } = useSocket();

  const [drivers, setDrivers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [filterAvailability, setFilterAvailability] = useState('all');

  // Add Driver Modal state
  const [isAddModalOpen, setIsAddModalOpen] = useState(false);

  // Assign Vehicle Modal state
  const [assignVehicleModal, setAssignVehicleModal] = useState({
    isOpen: false,
    driver: null
  });

  // Reset Password Modal state
  const [resetModal, setResetModal] = useState({
    isOpen: false,
    driver: null,
    newPassword: '',
    showPassword: true,
    submitting: false,
    success: null,
    copied: false
  });

  // Toast feedback
  const [toast, setToast] = useState(null);

  const showToast = (message, type = 'success') => {
    setToast({ message, type });
    setTimeout(() => setToast(null), 4000);
  };

  const fetchDrivers = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/drivers');
      if (res.ok) {
        const data = await res.json();
        setDrivers(data);
      }
    } catch (err) {
      console.error('Error fetching drivers:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchDrivers();
  }, []);

  // Listen for live driver updates
  useEffect(() => {
    if (!socket) return;

    const handleDriverUpdate = () => {
      fetchDrivers();
    };

    socket.on('driver:created', handleDriverUpdate);
    socket.on('driver:updated', handleDriverUpdate);

    return () => {
      socket.off('driver:created', handleDriverUpdate);
      socket.off('driver:updated', handleDriverUpdate);
    };
  }, [socket]);

  // Filter drivers
  const filteredDrivers = drivers.filter((d) => {
    const matchesSearch =
      d.name?.toLowerCase().includes(search.toLowerCase()) ||
      d.email?.toLowerCase().includes(search.toLowerCase()) ||
      d.vehicle_plate?.toLowerCase().includes(search.toLowerCase()) ||
      d.phone?.includes(search) ||
      d.license_number?.toLowerCase().includes(search.toLowerCase());

    const matchesAvail = filterAvailability === 'all' || d.availability === filterAvailability;

    return matchesSearch && matchesAvail;
  });

  // Metric counts
  const availableCount = drivers.filter((d) => d.availability === 'available').length;
  const busyCount = drivers.filter((d) => d.availability === 'busy').length;
  const offDutyCount = drivers.filter((d) => d.availability === 'off_duty').length;

  // Open Reset Password modal
  const openResetPasswordModal = (driver) => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    setResetModal({
      isOpen: true,
      driver,
      newPassword: `Drive#${code}`,
      showPassword: true,
      submitting: false,
      success: null,
      copied: false
    });
  };

  // Submit Password Reset
  const handleResetPassword = async (e) => {
    e.preventDefault();
    if (!resetModal.driver || !resetModal.newPassword.trim()) return;

    try {
      setResetModal((prev) => ({ ...prev, submitting: true }));
      const res = await apiFetch(`/api/drivers/${resetModal.driver.id}/reset-password`, {
        method: 'POST',
        body: JSON.stringify({ password: resetModal.newPassword.trim() })
      });
      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to reset password');
      }

      setResetModal((prev) => ({
        ...prev,
        submitting: false,
        success: {
          driverName: resetModal.driver.name,
          email: resetModal.driver.email,
          newPassword: resetModal.newPassword.trim()
        }
      }));
      showToast(`Password updated for ${resetModal.driver.name}`);
    } catch (err) {
      alert('Error: ' + err.message);
      setResetModal((prev) => ({ ...prev, submitting: false }));
    }
  };

  const copyResetCredentials = () => {
    if (!resetModal.success) return;
    const text = `SmartWaste Login Credentials\nUsername: ${resetModal.success.email}\nNew Password: ${resetModal.success.newPassword}\nLogin: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setResetModal((prev) => ({ ...prev, copied: true }));
    setTimeout(() => setResetModal((prev) => ({ ...prev, copied: false })), 3000);
  };

  // Delete Driver Account
  const handleDeleteDriver = async (driver) => {
    if (
      !window.confirm(
        `Are you sure you want to delete driver "${driver.name}" (${driver.email})? This permanently deletes their account.`
      )
    ) {
      return;
    }

    try {
      const res = await apiFetch(`/api/drivers/${driver.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`Driver ${driver.name} deleted.`);
        fetchDrivers();
      } else {
        const data = await res.json();
        alert('Error: ' + (data.error || 'Failed to delete driver'));
      }
    } catch (err) {
      alert('Error: ' + err.message);
    }
  };

  return (
    <div className="w-full space-y-6 pb-16 font-sans">
      {/* Toast Notification */}
      {toast && (
        <div className="fixed top-6 right-6 z-[99999] bg-slate-900 text-white px-5 py-3 rounded-2xl shadow-2xl flex items-center gap-3 border border-emerald-500/50 text-sm animate-in slide-in-from-top-3">
          <CheckCircle2 className="w-5 h-5 text-emerald-400 shrink-0" />
          <span className="font-bold">{toast.message}</span>
        </div>
      )}

      {/* Header & Primary Action Bar */}
      <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-blue-950 rounded-3xl p-6 sm:p-7 text-white shadow-xl border border-slate-700/40 flex flex-col sm:flex-row sm:items-center justify-between gap-5">
        <div>
          <div className="flex items-center gap-2 text-xs font-bold text-blue-400 uppercase tracking-widest mb-1.5">
            <Shield className="h-4 w-4" /> Municipal Fleet Administration
          </div>
          <h1 className="text-2xl sm:text-3xl font-black tracking-tight text-white">
            Driver Roster & Credential Management
          </h1>
          <p className="text-slate-300 text-xs sm:text-sm mt-1 max-w-2xl leading-relaxed">
            Only administrators can generate usernames and passwords for drivers. New drivers receive their credentials directly from this console.
          </p>
        </div>

        <button
          type="button"
          onClick={() => setIsAddModalOpen(true)}
          className="inline-flex items-center justify-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-500 hover:to-indigo-500 active:from-blue-700 text-white font-black text-xs sm:text-sm px-5 py-3 rounded-2xl shadow-lg transition-all cursor-pointer shrink-0 hover:shadow-blue-500/25"
        >
          <Plus className="w-4 h-4" />
          <span>Add New Driver</span>
        </button>
      </div>

      {/* Summary KPI Cards */}
      <div className="grid grid-cols-2 sm:grid-cols-4 gap-4">
        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Total Drivers</div>
            <div className="text-3xl font-black text-slate-900 dark:text-white mt-1">{drivers.length}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Registered fleet staff</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 flex items-center justify-center">
            <Users className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Available</div>
            <div className="text-3xl font-black text-blue-600 dark:text-blue-400 mt-1">{availableCount}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Ready for dispatch</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-blue-100/70 dark:bg-blue-900/40 text-blue-600 dark:text-blue-400 flex items-center justify-center">
            <CheckCircle2 className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">On Route (Busy)</div>
            <div className="text-3xl font-black text-amber-600 dark:text-amber-400 mt-1">{busyCount}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Currently collecting</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-amber-100/70 dark:bg-amber-900/40 text-amber-600 dark:text-amber-400 flex items-center justify-center">
            <Truck className="w-6 h-6" />
          </div>
        </div>

        <div className="p-5 bg-white dark:bg-slate-900 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-bold text-slate-500 uppercase tracking-wider">Off Duty</div>
            <div className="text-3xl font-black text-slate-600 dark:text-slate-400 mt-1">{offDutyCount}</div>
            <div className="text-xs text-slate-400 mt-0.5 font-medium">Inactive shift</div>
          </div>
          <div className="w-12 h-12 rounded-2xl bg-slate-100 dark:bg-slate-800 text-slate-500 flex items-center justify-center">
            <Clock className="w-6 h-6" />
          </div>
        </div>
      </div>

      {/* Filter and Search Bar */}
      <div className="bg-white dark:bg-slate-900 p-4 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs flex flex-col md:flex-row items-center justify-between gap-4">
        {/* Search */}
        <div className="relative w-full md:w-80">
          <Search className="w-4 h-4 text-slate-400 absolute left-3.5 top-1/2 -translate-y-1/2" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search driver name, email, license, plate..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs text-slate-800 dark:text-white focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 outline-none transition-all"
          />
        </div>

        {/* Filter Pills */}
        <div className="flex items-center gap-2 overflow-x-auto w-full md:w-auto pb-1 md:pb-0">
          <span className="text-xs font-bold text-slate-400 uppercase tracking-wider mr-1">Status:</span>
          {['all', 'available', 'busy', 'off_duty'].map((status) => (
            <button
              key={status}
              type="button"
              onClick={() => setFilterAvailability(status)}
              className={`px-3 py-1.5 rounded-xl text-xs font-bold capitalize transition-all cursor-pointer ${
                filterAvailability === status
                  ? 'bg-blue-600 text-white shadow-xs'
                  : 'bg-slate-100 dark:bg-slate-800 text-slate-600 dark:text-slate-300 hover:bg-slate-200'
              }`}
            >
              {status.replace('_', ' ')}
            </button>
          ))}

          <button
            type="button"
            onClick={fetchDrivers}
            className="p-1.5 rounded-lg text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors ml-auto cursor-pointer"
            title="Refresh driver roster"
          >
            <RefreshCw className={`w-4 h-4 ${loading ? 'animate-spin text-blue-600' : ''}`} />
          </button>
        </div>
      </div>

      {/* Driver Cards Grid */}
      <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-5">
        {filteredDrivers.length === 0 ? (
          <div className="col-span-full bg-white dark:bg-slate-900 rounded-3xl border border-slate-200 dark:border-slate-800 p-12 text-center text-slate-400 space-y-3">
            <Truck className="w-12 h-12 text-slate-300 dark:text-slate-700 mx-auto" />
            <h3 className="text-base font-bold text-slate-700 dark:text-slate-300">No Drivers Match Filter</h3>
            <p className="text-xs text-slate-400 max-w-sm mx-auto">
              Try adjusting your search criteria or register a new municipal driver using the button above.
            </p>
          </div>
        ) : (
          filteredDrivers.map((driver) => (
            <div
              key={driver.id}
              className="bg-white dark:bg-slate-900 rounded-3xl border border-slate-200/90 dark:border-slate-800 p-5 shadow-xs hover:shadow-md transition-all flex flex-col justify-between space-y-4 group"
            >
              {/* Card Header: Avatar, Name, Availability */}
              <div className="flex items-start justify-between gap-3">
                <div className="flex items-center gap-3">
                  <div className="w-12 h-12 rounded-2xl bg-gradient-to-br from-blue-500 to-indigo-600 text-white font-black text-lg flex items-center justify-center shadow-md">
                    {driver.name ? driver.name.charAt(0) : 'D'}
                  </div>
                  <div>
                    <h3 className="text-sm font-black text-slate-900 dark:text-white leading-tight">
                      {driver.name}
                    </h3>
                    <div className="text-[11px] text-slate-500 dark:text-slate-400 font-mono mt-0.5">
                      License: {driver.license_number || 'N/A'}
                    </div>
                  </div>
                </div>

                <span
                  className={`text-[10px] font-black px-2.5 py-1 rounded-full uppercase tracking-wider ${
                    driver.availability === 'available'
                      ? 'bg-blue-100 text-blue-800 dark:bg-blue-950 dark:text-blue-300 border border-blue-200'
                      : driver.availability === 'busy'
                      ? 'bg-amber-100 text-amber-800 dark:bg-amber-950 dark:text-amber-300 border border-amber-200'
                      : 'bg-slate-100 text-slate-700 dark:bg-slate-800 dark:text-slate-300 border border-slate-200'
                  }`}
                >
                  {driver.availability}
                </span>
              </div>

              {/* Login Credentials & Vehicle Info Box */}
              <div className="p-3 rounded-2xl bg-slate-50 dark:bg-slate-800/60 border border-slate-200/80 dark:border-slate-800 space-y-2 text-xs">
                {/* Username / Login Email */}
                <div>
                  <span className="text-[10px] font-bold text-slate-400 uppercase tracking-wider block">
                    Login Username / Email:
                  </span>
                  <div className="flex items-center justify-between mt-0.5 font-mono font-bold text-slate-800 dark:text-slate-200">
                    <span className="truncate" title={driver.email}>
                      {driver.email}
                    </span>
                    <button
                      type="button"
                      onClick={() => {
                        navigator.clipboard.writeText(driver.email);
                        showToast(`Copied ${driver.email}`);
                      }}
                      className="p-1 text-slate-400 hover:text-blue-600 transition-colors"
                      title="Copy username"
                    >
                      <Copy className="w-3.5 h-3.5" />
                    </button>
                  </div>
                </div>

                {/* Assigned Vehicle Display with Assign/Reassign Option */}
                {driver.assigned_vehicle_id ? (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between">
                    <span className="text-[11px] text-slate-500 flex items-center gap-1">
                      <Truck className="w-3 h-3 text-blue-600" /> Vehicle:
                    </span>
                    <div className="flex items-center gap-1.5">
                      <span className="font-mono font-extrabold text-blue-600 dark:text-blue-400 bg-blue-50 dark:bg-blue-950/60 px-2 py-0.5 rounded-lg text-[11px]">
                        {driver.vehicle_plate || 'Assigned'}
                      </span>
                      <button
                        type="button"
                        onClick={() => setAssignVehicleModal({ isOpen: true, driver })}
                        className="text-[10px] font-bold text-slate-600 dark:text-slate-300 hover:text-blue-600 bg-slate-200/70 dark:bg-slate-700/60 hover:bg-blue-50 px-2 py-0.5 rounded-md transition-colors cursor-pointer"
                        title="Reassign another vehicle"
                      >
                        Reassign
                      </button>
                    </div>
                  </div>
                ) : (
                  <div className="pt-2 border-t border-slate-200/60 dark:border-slate-700/50 flex items-center justify-between bg-amber-50/80 dark:bg-amber-950/40 p-2 rounded-xl border border-amber-200 dark:border-amber-800/60">
                    <div className="flex items-center gap-1.5 text-amber-800 dark:text-amber-200">
                      <AlertTriangle className="w-3.5 h-3.5 text-amber-600 shrink-0" />
                      <span className="text-[11px] font-bold">No Vehicle</span>
                    </div>
                    <button
                      type="button"
                      onClick={() => setAssignVehicleModal({ isOpen: true, driver })}
                      className="text-[11px] font-black text-white bg-blue-600 hover:bg-blue-700 px-2.5 py-1 rounded-lg transition-all shadow-xs cursor-pointer flex items-center gap-1"
                    >
                      <Truck className="w-3 h-3" />
                      <span>Assign Vehicle</span>
                    </button>
                  </div>
                )}

                {/* Phone */}
                <div className="flex items-center justify-between">
                  <span className="text-[11px] text-slate-500">Phone:</span>
                  <span className="font-semibold text-slate-700 dark:text-slate-300 text-[11px]">
                    {driver.phone || 'N/A'}
                  </span>
                </div>
              </div>

              {/* Action Buttons: Reset Password & Delete */}
              <div className="pt-2 border-t border-slate-100 dark:border-slate-800 flex items-center justify-between gap-2">
                <button
                  type="button"
                  onClick={() => openResetPasswordModal(driver)}
                  className="inline-flex items-center gap-1.5 text-xs font-bold text-blue-600 dark:text-blue-400 hover:text-blue-700 hover:bg-blue-50 dark:hover:bg-blue-950/50 px-3 py-1.5 rounded-xl transition-colors cursor-pointer"
                  title="Generate or change password for this driver"
                >
                  <KeyRound className="w-3.5 h-3.5" />
                  <span>Reset Password</span>
                </button>

                <button
                  type="button"
                  onClick={() => handleDeleteDriver(driver)}
                  className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 dark:hover:bg-rose-950/50 rounded-lg transition-colors cursor-pointer"
                  title="Delete driver account"
                >
                  <Trash2 className="w-4 h-4" />
                </button>
              </div>
            </div>
          ))
        )}
      </div>

      {/* ========================================================================= */}
      {/* 1. ADD NEW DRIVER MODAL (Reusable)                                        */}
      {/* ========================================================================= */}
      <AddDriverModal
        isOpen={isAddModalOpen}
        onClose={() => setIsAddModalOpen(false)}
        onDriverCreated={(newDriver) => {
          showToast(`Driver ${newDriver.name} added!`);
          fetchDrivers();
        }}
      />

      {/* ========================================================================= */}
      {/* 2. RESET PASSWORD MODAL (Admin only)                                      */}
      {/* ========================================================================= */}
      {resetModal.isOpen && (
        <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
          <div
            className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-md overflow-hidden p-6 space-y-4"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-slate-100 dark:border-slate-800 pb-3">
              <div className="flex items-center gap-2.5">
                <div className="w-9 h-9 rounded-xl bg-amber-100 text-amber-700 flex items-center justify-center">
                  <KeyRound className="w-5 h-5" />
                </div>
                <div>
                  <h3 className="text-sm font-black text-slate-900 dark:text-white">
                    Reset Password for {resetModal.driver?.name}
                  </h3>
                  <p className="text-[11px] text-slate-500">Generate a new password to hand to the driver</p>
                </div>
              </div>
              <button
                onClick={() => setResetModal((prev) => ({ ...prev, isOpen: false, success: null }))}
                className="text-slate-400 hover:text-slate-700"
              >
                <X className="w-5 h-5" />
              </button>
            </div>

            {resetModal.success ? (
              <div className="space-y-4 text-center">
                <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 space-y-2">
                  <CheckCircle2 className="w-8 h-8 text-emerald-600 mx-auto" />
                  <div className="text-xs font-bold text-emerald-800 dark:text-emerald-200">
                    Password Reset Successfully!
                  </div>
                  <div className="text-[11px] text-slate-600 dark:text-slate-400">
                    Provide the updated credentials to {resetModal.success.driverName}:
                  </div>
                </div>

                <div className="p-4 rounded-2xl bg-slate-900 text-white font-mono text-xs space-y-2 text-left">
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-sans">Username:</span>
                    <div className="text-emerald-400 font-bold">{resetModal.success.email}</div>
                  </div>
                  <div>
                    <span className="text-[10px] text-slate-400 uppercase font-sans">New Password:</span>
                    <div className="text-amber-400 font-bold">{resetModal.success.newPassword}</div>
                  </div>
                </div>

                <div className="flex items-center gap-3">
                  <button
                    type="button"
                    onClick={copyResetCredentials}
                    className="flex-1 bg-blue-600 hover:bg-blue-700 text-white font-bold py-2.5 rounded-xl text-xs flex items-center justify-center gap-1.5"
                  >
                    {resetModal.copied ? <Check className="w-4 h-4" /> : <Copy className="w-4 h-4" />}
                    <span>{resetModal.copied ? 'Copied!' : 'Copy Credentials'}</span>
                  </button>
                  <button
                    type="button"
                    onClick={() => setResetModal((prev) => ({ ...prev, isOpen: false, success: null }))}
                    className="px-4 py-2.5 bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300 rounded-xl text-xs font-bold"
                  >
                    Close
                  </button>
                </div>
              </div>
            ) : (
              <form onSubmit={handleResetPassword} className="space-y-4 text-xs">
                <div>
                  <span className="text-[11px] font-bold text-slate-500">Driver Email / Username:</span>
                  <div className="font-mono font-bold text-slate-800 dark:text-slate-200 mt-0.5">
                    {resetModal.driver?.email}
                  </div>
                </div>

                <div>
                  <div className="flex items-center justify-between mb-1">
                    <label className="font-bold text-slate-700 dark:text-slate-300">New Password *</label>
                    <button
                      type="button"
                      onClick={() => {
                        const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
                        let code = '';
                        for (let i = 0; i < 4; i++) code += chars.charAt(Math.floor(Math.random() * chars.length));
                        setResetModal((prev) => ({ ...prev, newPassword: `Drive#${code}` }));
                      }}
                      className="text-[10px] font-extrabold text-emerald-600 hover:underline flex items-center gap-1"
                    >
                      <Sparkles className="w-3 h-3" /> Auto-Generate
                    </button>
                  </div>

                  <div className="relative">
                    <input
                      type={resetModal.showPassword ? 'text' : 'password'}
                      required
                      value={resetModal.newPassword}
                      onChange={(e) => setResetModal((prev) => ({ ...prev, newPassword: e.target.value }))}
                      className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl font-mono text-xs focus:border-blue-500 outline-none text-slate-900 dark:text-white"
                    />
                    <button
                      type="button"
                      onClick={() => setResetModal((prev) => ({ ...prev, showPassword: !prev.showPassword }))}
                      className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400"
                    >
                      {resetModal.showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                    </button>
                  </div>
                </div>

                <div className="pt-2 flex items-center justify-end gap-2">
                  <button
                    type="button"
                    onClick={() => setResetModal((prev) => ({ ...prev, isOpen: false }))}
                    className="px-4 py-2 border rounded-xl font-bold text-slate-600 dark:text-slate-400"
                  >
                    Cancel
                  </button>
                  <button
                    type="submit"
                    disabled={resetModal.submitting}
                    className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white font-extrabold rounded-xl shadow-xs"
                  >
                    {resetModal.submitting ? 'Updating...' : 'Set & Issue Password'}
                  </button>
                </div>
              </form>
            )}
          </div>
        </div>
      )}

      {/* ========================================================================= */}
      {/* 3. ASSIGN VEHICLE MODAL (Dynamic Vehicle Pairing)                         */}
      {/* ========================================================================= */}
      {assignVehicleModal.isOpen && assignVehicleModal.driver && (
        <AssignVehicleModal
          isOpen={assignVehicleModal.isOpen}
          onClose={() => setAssignVehicleModal({ isOpen: false, driver: null })}
          driver={assignVehicleModal.driver}
          onAssigned={(updatedDriver) => {
            showToast(`Vehicle assigned to ${updatedDriver.name}!`);
            fetchDrivers();
          }}
        />
      )}
    </div>
  );
}
