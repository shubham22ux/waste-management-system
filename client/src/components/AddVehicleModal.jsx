import React, { useState } from 'react';
import { apiFetch } from '../api';
import {
  X,
  Truck,
  Fuel,
  Gauge,
  AlertCircle,
  Check,
  Building2,
  Tag
} from 'lucide-react';

export default function AddVehicleModal({ isOpen, onClose, onVehicleCreated }) {
  const [plateNumber, setPlateNumber] = useState('');
  const [company, setCompany] = useState('');
  const [model, setModel] = useState('');
  const [vehicleType, setVehicleType] = useState('Hydraulic Compactor');
  const [fuelType, setFuelType] = useState('Diesel');
  const [tankCapacity, setTankCapacity] = useState('150');
  const [avgMileage, setAvgMileage] = useState('6.0');
  const [status, setStatus] = useState('available');

  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  if (!isOpen) return null;

  const handleSubmit = async (e) => {
    e.preventDefault();
    setError('');

    if (!plateNumber.trim() || !model.trim() || !avgMileage) {
      setError('Please fill in Plate Number, Vehicle Model/Name, and Average Mileage.');
      return;
    }

    // Combine company and model for comprehensive display (e.g. "Tata Motors - 14T Hydraulic Compactor")
    const combinedModel = company.trim()
      ? `${company.trim()} ${model.trim()}`
      : model.trim();

    try {
      setSubmitting(true);
      const res = await apiFetch('/api/vehicles', {
        method: 'POST',
        body: JSON.stringify({
          plate_number: plateNumber.trim().toUpperCase(),
          model: combinedModel,
          fuel_type: fuelType,
          tank_capacity: Number(tankCapacity) || 150,
          avg_mileage_kmpl: Number(avgMileage) || 6.0,
          status
        })
      });

      const data = await res.json();

      if (!res.ok) {
        throw new Error(data.error || 'Failed to create vehicle');
      }

      // Reset form
      setPlateNumber('');
      setCompany('');
      setModel('');
      setVehicleType('Hydraulic Compactor');
      setFuelType('Diesel');
      setTankCapacity('150');
      setAvgMileage('6.0');
      setStatus('available');

      if (onVehicleCreated) {
        onVehicleCreated(data);
      }
      onClose();
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="fixed inset-0 z-[99999] flex items-center justify-center p-4 bg-slate-950/80 backdrop-blur-md animate-in fade-in duration-200">
      <div className="bg-white dark:bg-slate-900 w-full max-w-xl rounded-3xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden text-slate-900 dark:text-white">
        {/* Header */}
        <div className="bg-gradient-to-r from-slate-900 via-slate-800 to-teal-950 p-6 text-white flex items-center justify-between border-b border-slate-700/50">
          <div className="flex items-center gap-3">
            <div className="w-11 h-11 rounded-2xl bg-teal-500/20 border border-teal-400/30 flex items-center justify-center text-teal-300">
              <Truck className="w-6 h-6" />
            </div>
            <div>
              <h2 className="text-lg font-black tracking-tight">Add Waste Collection Vehicle</h2>
              <p className="text-xs text-slate-300">
                Manually register any waste truck, compactor, or collection van from any manufacturer
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

        {/* Form Body */}
        <form onSubmit={handleSubmit} className="p-6 space-y-4">
          {error && (
            <div className="p-3 bg-rose-50 dark:bg-rose-950/50 border border-rose-200 dark:border-rose-800 text-rose-700 dark:text-rose-300 rounded-xl text-xs flex items-center gap-2">
              <AlertCircle className="w-4 h-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          <div className="grid grid-cols-1 sm:grid-cols-2 gap-3.5">
            {/* Manufacturer / Company Name */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Building2 className="w-3.5 h-3.5 text-teal-600" />
                Company / Manufacturer
              </label>
              <input
                type="text"
                value={company}
                onChange={(e) => setCompany(e.target.value)}
                placeholder="e.g. Tata, Mahindra, Ashok Leyland, Eicher, BharatBenz, Isuzu, Force..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
              />
            </div>

            {/* Plate Number */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Plate / Registration Number *
              </label>
              <input
                type="text"
                value={plateNumber}
                onChange={(e) => setPlateNumber(e.target.value.toUpperCase())}
                placeholder="e.g. KA-01-EA-5050"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm font-mono font-bold focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none uppercase"
                required
              />
            </div>

            {/* Model & Equipment Description */}
            <div className="sm:col-span-2">
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Tag className="w-3.5 h-3.5 text-teal-600" />
                Vehicle Model & Equipment Type *
              </label>
              <input
                type="text"
                value={model}
                onChange={(e) => setModel(e.target.value)}
                placeholder="e.g. 14T Hydraulic Compactor, Tipper Truck, Dumper Placer, Mini Garbage Van, Hook Loader, Electric Cart..."
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none"
                required
              />
            </div>

            {/* Fuel / Energy Type */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Fuel className="w-3.5 h-3.5 text-teal-600" />
                Fuel / Energy Type
              </label>
              <select
                value={fuelType}
                onChange={(e) => setFuelType(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none cursor-pointer"
              >
                <option value="Diesel">Diesel</option>
                <option value="CNG">CNG (Compressed Natural Gas)</option>
                <option value="Electric">Electric (Battery EV)</option>
                <option value="Petrol">Petrol</option>
                <option value="Hybrid">Hybrid</option>
                <option value="Bio-CNG">Bio-CNG / Biogas</option>
              </select>
            </div>

            {/* Status */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Operational Status
              </label>
              <select
                value={status}
                onChange={(e) => setStatus(e.target.value)}
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none cursor-pointer"
              >
                <option value="available">Available (Ready for Dispatch)</option>
                <option value="maintenance">Under Maintenance</option>
              </select>
            </div>

            {/* Tank / Battery Capacity */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1 flex items-center gap-1.5">
                <Gauge className="w-3.5 h-3.5 text-teal-600" />
                Tank / Battery Capacity (Liters / kWh)
              </label>
              <input
                type="number"
                step="1"
                min="0"
                value={tankCapacity}
                onChange={(e) => setTankCapacity(e.target.value)}
                placeholder="150"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none font-mono"
              />
            </div>

            {/* Average Mileage / Efficiency */}
            <div>
              <label className="block text-xs font-bold text-slate-700 dark:text-slate-300 uppercase tracking-wider mb-1">
                Average Mileage / Range (km/L or km/kWh) *
              </label>
              <input
                type="number"
                step="0.1"
                min="0.1"
                value={avgMileage}
                onChange={(e) => setAvgMileage(e.target.value)}
                placeholder="6.5"
                className="w-full px-3.5 py-2.5 bg-slate-50 dark:bg-slate-800 border border-slate-300 dark:border-slate-700 rounded-xl text-sm focus:bg-white dark:focus:bg-slate-900 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none font-mono"
                required
              />
            </div>
          </div>

          {/* Footer Actions */}
          <div className="pt-4 border-t border-slate-100 dark:border-slate-800 flex items-center justify-end gap-3">
            <button
              type="button"
              onClick={onClose}
              className="px-4 py-2.5 text-xs font-bold text-slate-600 dark:text-slate-400 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-xl transition-colors cursor-pointer"
            >
              Cancel
            </button>
            <button
              type="submit"
              disabled={submitting}
              className="px-5 py-2.5 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-500 hover:to-emerald-500 text-white text-xs font-black rounded-xl shadow-lg transition-all disabled:opacity-50 flex items-center gap-2 cursor-pointer"
            >
              <Check className="w-4 h-4" />
              <span>{submitting ? 'Registering...' : 'Add Vehicle to Fleet'}</span>
            </button>
          </div>
        </form>
      </div>
    </div>
  );
}
