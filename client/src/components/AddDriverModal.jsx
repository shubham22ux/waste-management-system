import React, { useState, useEffect } from 'react';
import { apiFetch } from '../api';
import {
  X,
  Truck,
  User,
  KeyRound,
  Phone,
  CreditCard,
  Sparkles,
  Copy,
  Check,
  AlertCircle,
  Eye,
  EyeOff,
  ShieldCheck
} from 'lucide-react';

export default function AddDriverModal({ isOpen, onClose, onDriverCreated }) {
  const [name, setName] = useState('');
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [showPassword, setShowPassword] = useState(false);
  const [phone, setPhone] = useState('');
  const [licenseNumber, setLicenseNumber] = useState('');
  const [assignedVehicleId, setAssignedVehicleId] = useState('');

  const [vehicles, setVehicles] = useState([]);
  const [loadingVehicles, setLoadingVehicles] = useState(false);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  // Post-creation credentials handout view
  const [createdCredentials, setCreatedCredentials] = useState(null);
  const [copied, setCopied] = useState(false);

  // Auto-generate password helper
  const handleGeneratePassword = () => {
    const chars = 'ABCDEFGHJKLMNPQRSTUVWXYZ23456789';
    let code = '';
    for (let i = 0; i < 4; i++) {
      code += chars.charAt(Math.floor(Math.random() * chars.length));
    }
    const gen = `Driver#${code}`;
    setPassword(gen);
    setShowPassword(true);
  };

  // Suggest username from driver name
  const handleSuggestUsername = () => {
    if (!name.trim()) return;
    const clean = name
      .trim()
      .toLowerCase()
      .replace(/[^a-z0-9]/g, '.');
    setEmail(`${clean}@smartwaste.gov`);
  };

  // Fetch vehicles for dropdown
  useEffect(() => {
    if (!isOpen) return;

    const fetchVehicles = async () => {
      try {
        setLoadingVehicles(true);
        const res = await apiFetch('/api/vehicles');
        if (res.ok) {
          const data = await res.json();
          setVehicles(data);
        }
      } catch (err) {
        console.error('Failed to load vehicles', err);
      } finally {
        setLoadingVehicles(false);
      }
    };

    fetchVehicles();
    handleGeneratePassword();
  }, [isOpen]);

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!name.trim() || !email.trim() || !licenseNumber.trim() || !password.trim()) {
      setError('Please fill in Name, Email/Username, Password, and License Number.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await apiFetch('/api/drivers', {
        method: 'POST',
        body: JSON.stringify({
          name: name.trim(),
          email: email.trim().toLowerCase(),
          password: password.trim(),
          phone: phone.trim() || null,
          license_number: licenseNumber.trim(),
          assigned_vehicle_id: assignedVehicleId ? Number(assignedVehicleId) : null
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create driver account.');
      }

      setCreatedCredentials({
        name: name.trim(),
        email: email.trim().toLowerCase(),
        password: password.trim()
      });

      if (onDriverCreated) {
        onDriverCreated(data.driver, data.credentials);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleCopyCredentials = () => {
    if (!createdCredentials) return;
    const text = `SmartWaste Municipal Driver Account\nName: ${createdCredentials.name}\nUsername / Login: ${createdCredentials.email}\nPassword: ${createdCredentials.password}\nLogin Portal: ${window.location.origin}/login`;
    navigator.clipboard.writeText(text);
    setCopied(true);
    setTimeout(() => setCopied(false), 3000);
  };

  const handleResetAndClose = () => {
    setName('');
    setEmail('');
    setPassword('');
    setPhone('');
    setLicenseNumber('');
    setAssignedVehicleId('');
    setError('');
    setCreatedCredentials(null);
    onClose();
  };

  if (!isOpen) return null;

  return (
    <div className="fixed inset-0 z-[9999] flex items-center justify-center p-4 bg-slate-950/70 backdrop-blur-sm animate-in fade-in">
      <div
        className="bg-white dark:bg-slate-900 rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 w-full max-w-lg overflow-hidden flex flex-col max-h-[92vh]"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Modal Header */}
        <div className="flex items-center justify-between px-6 py-4.5 border-b border-slate-100 dark:border-slate-800 bg-slate-50/80 dark:bg-slate-800/50 shrink-0">
          <div className="flex items-center gap-3">
            <div className="w-10 h-10 rounded-2xl bg-blue-100 dark:bg-blue-900/60 text-blue-600 dark:text-blue-400 flex items-center justify-center shadow-xs">
              <Truck className="w-5 h-5" />
            </div>
            <div>
              <h2 className="text-base font-black text-slate-900 dark:text-white">
                {createdCredentials ? 'Driver Account Created' : 'Register New Driver Account'}
              </h2>
              <p className="text-xs text-slate-500 dark:text-slate-400">
                {createdCredentials
                  ? 'Hand these credentials to the new driver'
                  : 'Only admins can generate login credentials for drivers'}
              </p>
            </div>
          </div>

          <button
            onClick={handleResetAndClose}
            className="p-1.5 rounded-xl text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
          >
            <X className="w-5 h-5" />
          </button>
        </div>

        {/* Modal Body */}
        <div className="p-6 overflow-y-auto space-y-4 text-xs font-sans">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-900 text-rose-700 dark:text-rose-300 rounded-xl flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span className="font-semibold">{error}</span>
            </div>
          )}

          {createdCredentials ? (
            /* SUCCESS HANDOUT SCREEN */
            <div className="space-y-5 animate-in zoom-in-95">
              <div className="p-4 rounded-2xl bg-emerald-50 dark:bg-emerald-950/40 border border-emerald-300 dark:border-emerald-800 text-center space-y-2">
                <div className="w-12 h-12 rounded-full bg-emerald-100 dark:bg-emerald-900/70 text-emerald-600 dark:text-emerald-300 flex items-center justify-center mx-auto">
                  <ShieldCheck className="w-6 h-6" />
                </div>
                <h3 className="text-sm font-black text-slate-900 dark:text-white">
                  Driver Account Created Successfully!
                </h3>
                <p className="text-[11px] text-slate-600 dark:text-slate-400">
                  The driver cannot create their own account. Give these login credentials to the driver:
                </p>
              </div>

              {/* Credential Box */}
              <div className="p-4 rounded-2xl bg-slate-900 text-white space-y-3 font-mono border border-slate-800 shadow-inner">
                <div>
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest font-sans font-bold">
                    Username / Login Email
                  </span>
                  <div className="text-sm font-bold text-emerald-400 select-all mt-0.5">
                    {createdCredentials.email}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800">
                  <span className="text-[10px] text-slate-400 uppercase tracking-widest font-sans font-bold">
                    Generated Password
                  </span>
                  <div className="text-sm font-bold text-amber-400 select-all mt-0.5">
                    {createdCredentials.password}
                  </div>
                </div>

                <div className="pt-2 border-t border-slate-800 text-[10px] text-slate-400 font-sans">
                  Login URL: <span className="text-slate-200">{window.location.origin}/login</span>
                </div>
              </div>

              {/* Copy & Close Actions */}
              <div className="flex items-center gap-3">
                <button
                  type="button"
                  onClick={handleCopyCredentials}
                  className="flex-1 inline-flex items-center justify-center gap-2 bg-blue-600 hover:bg-blue-700 active:bg-blue-800 text-white font-extrabold py-3 px-4 rounded-xl text-xs shadow-md transition-all cursor-pointer"
                >
                  {copied ? <Check className="w-4 h-4 text-emerald-300" /> : <Copy className="w-4 h-4" />}
                  <span>{copied ? 'Credentials Copied!' : 'Copy Credentials to Clipboard'}</span>
                </button>

                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="bg-slate-100 hover:bg-slate-200 dark:bg-slate-800 dark:hover:bg-slate-700 text-slate-700 dark:text-slate-200 font-bold py-3 px-5 rounded-xl transition-colors cursor-pointer"
                >
                  Done
                </button>
              </div>
            </div>
          ) : (
            /* DRIVER CREATION FORM */
            <form onSubmit={handleSubmit} className="space-y-4">
              {/* Full Name */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Driver's Full Name *
                </label>
                <div className="relative">
                  <User className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type="text"
                    required
                    value={name}
                    onChange={(e) => setName(e.target.value)}
                    placeholder="e.g. Ramesh Kumar"
                    className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 outline-none transition-all text-slate-900 dark:text-white"
                  />
                </div>
              </div>

              {/* Username / Email with auto-suggest */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Username / Login Email *
                  </label>
                  {name && (
                    <button
                      type="button"
                      onClick={handleSuggestUsername}
                      className="text-[10px] font-extrabold text-blue-600 hover:underline cursor-pointer"
                    >
                      Suggest from Name
                    </button>
                  )}
                </div>
                <input
                  type="email"
                  required
                  value={email}
                  onChange={(e) => setEmail(e.target.value)}
                  placeholder="e.g. ramesh@smartwaste.gov"
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 outline-none transition-all text-slate-900 dark:text-white font-mono"
                />
              </div>

              {/* Password with generator */}
              <div>
                <div className="flex items-center justify-between mb-1">
                  <label className="font-bold text-slate-700 dark:text-slate-300">
                    Password *
                  </label>
                  <button
                    type="button"
                    onClick={handleGeneratePassword}
                    className="inline-flex items-center gap-1 text-[10px] font-extrabold text-emerald-600 dark:text-emerald-400 hover:underline cursor-pointer"
                  >
                    <Sparkles className="w-3 h-3" /> Generate Password
                  </button>
                </div>
                <div className="relative">
                  <KeyRound className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                  <input
                    type={showPassword ? 'text' : 'password'}
                    required
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="Enter or generate password"
                    className="w-full pl-9 pr-10 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 outline-none transition-all text-slate-900 dark:text-white font-mono"
                  />
                  <button
                    type="button"
                    onClick={() => setShowPassword(!showPassword)}
                    className="absolute right-3 top-1/2 -translate-y-1/2 text-slate-400 hover:text-slate-700 cursor-pointer"
                  >
                    {showPassword ? <EyeOff className="w-4 h-4" /> : <Eye className="w-4 h-4" />}
                  </button>
                </div>
              </div>

              {/* License Number & Phone */}
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Driver License No. *
                  </label>
                  <div className="relative">
                    <CreditCard className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="text"
                      required
                      value={licenseNumber}
                      onChange={(e) => setLicenseNumber(e.target.value)}
                      placeholder="KA-01-2026-0099"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 outline-none transition-all text-slate-900 dark:text-white uppercase font-mono"
                    />
                  </div>
                </div>

                <div>
                  <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                    Phone Number
                  </label>
                  <div className="relative">
                    <Phone className="w-4 h-4 text-slate-400 absolute left-3 top-1/2 -translate-y-1/2" />
                    <input
                      type="tel"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value)}
                      placeholder="+91 98765 00000"
                      className="w-full pl-9 pr-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 outline-none transition-all text-slate-900 dark:text-white font-mono"
                    />
                  </div>
                </div>
              </div>

              {/* Assigned Vehicle Dropdown */}
              <div>
                <label className="block font-bold text-slate-700 dark:text-slate-300 mb-1">
                  Assign Municipal Collection Vehicle (Optional)
                </label>
                <select
                  value={assignedVehicleId}
                  onChange={(e) => setAssignedVehicleId(e.target.value)}
                  className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-xs focus:bg-white dark:focus:bg-slate-900 focus:border-blue-500 outline-none transition-all text-slate-900 dark:text-white"
                >
                  <option value="">-- No vehicle assigned yet (idle) --</option>
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.model} ({v.plate_number}) • {v.fuel_type || 'Diesel'}
                    </option>
                  ))}
                </select>
              </div>

              {/* Submit Button */}
              <div className="pt-3 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
                <button
                  type="button"
                  onClick={handleResetAndClose}
                  className="px-4 py-2.5 rounded-xl border border-slate-300 dark:border-slate-700 font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 transition-colors cursor-pointer"
                >
                  Cancel
                </button>

                <button
                  type="submit"
                  disabled={submitting}
                  className="inline-flex items-center gap-2 bg-gradient-to-r from-blue-600 to-indigo-600 hover:from-blue-700 hover:to-indigo-700 active:from-blue-800 text-white font-extrabold px-5 py-2.5 rounded-xl shadow-md transition-all cursor-pointer disabled:opacity-50"
                >
                  {submitting ? (
                    <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                  ) : (
                    <Truck className="w-4 h-4" />
                  )}
                  <span>Create Driver & Issue Password</span>
                </button>
              </div>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}
