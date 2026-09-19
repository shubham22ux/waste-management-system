import React, { useEffect, useState, useMemo } from 'react';
import {
  ResponsiveContainer,
  LineChart,
  Line,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  Legend,
  Cell,
  ReferenceLine
} from 'recharts';
import { apiFetch } from '../api';
import { useSocket } from '../context/SocketContext';
import {
  Fuel,
  TrendingUp,
  TrendingDown,
  AlertTriangle,
  CheckCircle2,
  Truck,
  Plus,
  Edit2,
  Trash2,
  Calendar,
  DollarSign,
  Gauge,
  Route as RouteIcon,
  Search,
  Filter,
  X,
  Sparkles,
  Layers,
  ArrowUpRight,
  ShieldAlert,
  ShieldCheck,
  Zap
} from 'lucide-react';

const VEHICLE_COLORS = [
  '#0d9488', // Teal
  '#3b82f6', // Blue
  '#8b5cf6', // Purple
  '#ef4444', // Red
  '#f59e0b', // Amber
  '#ec4899', // Pink
];

export default function FuelAnalytics() {
  const [analytics, setAnalytics] = useState(null);
  const [fuelLogs, setFuelLogs] = useState([]);
  const [vehicles, setVehicles] = useState([]);
  const [routes, setRoutes] = useState([]);
  const [loading, setLoading] = useState(true);
  const [tableLoading, setTableLoading] = useState(false);
  const [search, setSearch] = useState('');
  const [vehicleFilter, setVehicleFilter] = useState('all');

  // Modal States
  const [isModalOpen, setIsModalOpen] = useState(false);
  const [editingLog, setEditingLog] = useState(null);
  const [deletingLogId, setDeletingLogId] = useState(null);
  const [submitting, setSubmitting] = useState(false);
  const [toast, setToast] = useState(null);

  // Form State
  const [formData, setFormData] = useState({
    vehicle_id: '',
    route_id: '',
    liters_filled: '',
    cost: '',
    odometer_km: '',
    log_date: new Date().toISOString().split('T')[0]
  });

  const { socket } = useSocket();

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/fuel-logs/analytics');
      if (res.ok) {
        const data = await res.json();
        setAnalytics(data);
      }
    } catch (err) {
      console.error('Failed to fetch fuel analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchFuelLogs = async () => {
    try {
      setTableLoading(true);
      const [logsRes, vehiclesRes, routesRes] = await Promise.all([
        apiFetch('/api/fuel-logs'),
        apiFetch('/api/vehicles'),
        apiFetch('/api/routes')
      ]);

      if (logsRes.ok && vehiclesRes.ok && routesRes.ok) {
        const logsData = await logsRes.json();
        const vehiclesData = await vehiclesRes.json();
        const routesData = await routesRes.json();

        setFuelLogs(logsData);
        setVehicles(vehiclesData);
        setRoutes(routesData);
      }
    } catch (err) {
      console.error('Failed to load logs:', err);
    } finally {
      setTableLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
    fetchFuelLogs();
  }, []);

  // Real-time updates via Socket.IO
  useEffect(() => {
    if (!socket) return;

    const handleFuelUpdate = () => {
      fetchAnalytics();
      fetchFuelLogs();
    };

    socket.on('fuel:logged', handleFuelUpdate);
    socket.on('fuel:updated', handleFuelUpdate);
    socket.on('fuel:deleted', handleFuelUpdate);
    socket.on('route:completed', handleFuelUpdate);

    return () => {
      socket.off('fuel:logged', handleFuelUpdate);
      socket.off('fuel:updated', handleFuelUpdate);
      socket.off('fuel:deleted', handleFuelUpdate);
      socket.off('route:completed', handleFuelUpdate);
    };
  }, [socket]);

  // Open modal for Create or Edit
  const openLogModal = (log = null) => {
    if (log) {
      setEditingLog(log);
      setFormData({
        vehicle_id: log.vehicle_id,
        route_id: log.route_id || '',
        liters_filled: log.liters_filled,
        cost: log.cost,
        odometer_km: log.odometer_km,
        log_date: log.log_date
      });
    } else {
      setEditingLog(null);
      setFormData({
        vehicle_id: vehicles[0]?.id || '',
        route_id: '',
        liters_filled: '',
        cost: '',
        odometer_km: '',
        log_date: new Date().toISOString().split('T')[0]
      });
    }
    setIsModalOpen(true);
  };

  // Form submit handler
  const handleFormSubmit = async (e) => {
    e.preventDefault();
    try {
      setSubmitting(true);
      const url = editingLog ? `/api/fuel-logs/${editingLog.id}` : '/api/fuel-logs';
      const method = editingLog ? 'PUT' : 'POST';

      const res = await apiFetch(url, {
        method,
        body: JSON.stringify({
          vehicle_id: Number(formData.vehicle_id),
          route_id: formData.route_id ? Number(formData.route_id) : null,
          liters_filled: Number(formData.liters_filled),
          cost: formData.cost !== '' ? Number(formData.cost) : Math.round(Number(formData.liters_filled) * 94.5),
          odometer_km: Number(formData.odometer_km),
          log_date: formData.log_date
        })
      });

      if (res.ok) {
        setIsModalOpen(false);
        setToast({
          type: 'success',
          message: editingLog ? 'Fuel log updated successfully.' : 'New fuel log recorded successfully.'
        });
        fetchAnalytics();
        fetchFuelLogs();
      } else {
        const data = await res.json();
        alert(data.error || 'Failed to save fuel log');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setSubmitting(false);
    }
  };

  // Delete handler
  const handleDeleteLog = async (id) => {
    try {
      const res = await apiFetch(`/api/fuel-logs/${id}`, { method: 'DELETE' });
      if (res.ok) {
        setDeletingLogId(null);
        setToast({ type: 'success', message: 'Fuel log entry deleted.' });
        fetchAnalytics();
        fetchFuelLogs();
      }
    } catch (err) {
      console.error(err);
    }
  };

  // Filtered Fuel Logs
  const filteredLogs = useMemo(() => {
    return fuelLogs.filter((log) => {
      const matchesVehicle = vehicleFilter === 'all' || String(log.vehicle_id) === String(vehicleFilter);
      const matchesSearch =
        search === '' ||
        log.plate_number?.toLowerCase().includes(search.toLowerCase()) ||
        log.model?.toLowerCase().includes(search.toLowerCase()) ||
        (log.route_name && log.route_name.toLowerCase().includes(search.toLowerCase()));
      return matchesVehicle && matchesSearch;
    });
  }, [fuelLogs, vehicleFilter, search]);

  const summary = analytics?.summary;
  const monthlyTrend = analytics?.monthly_trend || [];
  const litersPerVehicle = analytics?.liters_per_vehicle || [];
  const vehicleEfficiency = analytics?.vehicle_efficiency || [];
  const costPerRoute = analytics?.cost_per_route || [];

  return (
    <div className="space-y-6 max-w-7xl mx-auto pb-12">
      {/* Toast Alert */}
      {toast && (
        <div
          className={`p-4 rounded-xl text-xs font-semibold flex items-center justify-between border shadow-sm ${
            toast.type === 'success'
              ? 'bg-emerald-50 text-emerald-800 border-emerald-200'
              : 'bg-rose-50 text-rose-800 border-rose-200'
          }`}
        >
          <div className="flex items-center gap-2">
            <CheckCircle2 className="h-4 w-4 text-emerald-600" />
            <span>{toast.message}</span>
          </div>
          <button onClick={() => setToast(null)} className="p-1 text-slate-400 hover:text-slate-600">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 bg-gradient-to-r from-slate-900 via-slate-800 to-emerald-950 p-6 rounded-2xl shadow-lg border border-slate-800 text-white">
        <div>
          <div className="flex items-center gap-2.5">
            <div className="h-10 w-10 rounded-xl bg-teal-500/20 border border-teal-500/30 flex items-center justify-center text-teal-400">
              <Fuel className="h-5 w-5" />
            </div>
            <div>
              <h2 className="text-xl font-extrabold text-white flex items-center gap-2">
                Fuel Analytics & Fleet Health
              </h2>
              <p className="text-xs text-slate-400 mt-0.5">
                Recharts visual metrics, monthly spend trends, vehicle efficiency benchmarks, and maintenance alerts.
              </p>
            </div>
          </div>
        </div>

        <div className="flex items-center gap-3">
          <button
            type="button"
            onClick={() => openLogModal()}
            className="inline-flex items-center gap-2 px-4 py-2.5 rounded-xl font-bold text-xs bg-gradient-to-r from-teal-500 to-emerald-600 hover:from-teal-400 hover:to-emerald-500 text-white shadow-md active:scale-95 transition-all"
          >
            <Plus className="h-4 w-4" />
            Record Fuel Log
          </button>
        </div>
      </div>

      {/* 1. Summary Cards Strip */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Total Cost This Month */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <DollarSign className="h-3.5 w-3.5 text-emerald-600" />
              Fuel Cost This Month
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              ₹{summary ? Number(summary.total_cost_this_month).toLocaleString() : '—'}
            </div>
            <div className="text-[11px] text-emerald-600 font-semibold mt-0.5 flex items-center gap-1">
              <TrendingUp className="h-3 w-3" />
              Diesel Avg ₹94.5/L
            </div>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center font-bold">
            ₹
          </div>
        </div>

        {/* Total Liters Consumed This Month */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <Fuel className="h-3.5 w-3.5 text-teal-600" />
              Total Fuel Consumed
            </div>
            <div className="text-2xl font-black text-slate-900 mt-1">
              {summary ? summary.total_liters_this_month : '—'}{' '}
              <span className="text-xs font-normal text-slate-500">Liters</span>
            </div>
            <div className="text-[11px] text-slate-500 mt-0.5">
              Across active fleet routes
            </div>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-teal-50 text-teal-600 flex items-center justify-center">
            <Fuel className="h-6 w-6" />
          </div>
        </div>

        {/* Most Efficient Vehicle */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <ShieldCheck className="h-3.5 w-3.5 text-emerald-600" />
              Most Efficient Vehicle
            </div>
            <div className="text-sm font-extrabold text-slate-900 mt-1 truncate max-w-[170px]" title={summary?.most_efficient_vehicle?.model}>
              {summary?.most_efficient_vehicle?.model || '—'}
            </div>
            <div className="text-[11px] text-emerald-600 font-bold mt-0.5">
              {summary?.most_efficient_vehicle?.actual_mileage} km/L ({summary?.most_efficient_vehicle?.deviation_percent > 0 ? '+' : ''}{summary?.most_efficient_vehicle?.deviation_percent}%)
            </div>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-emerald-50 text-emerald-600 flex items-center justify-center">
            <Zap className="h-6 w-6" />
          </div>
        </div>

        {/* Least Efficient Vehicle / Alert */}
        <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs flex items-center justify-between">
          <div>
            <div className="text-xs font-semibold text-slate-500 flex items-center gap-1.5">
              <ShieldAlert className="h-3.5 w-3.5 text-rose-600" />
              Least Efficient Vehicle
            </div>
            <div className="text-sm font-extrabold text-slate-900 mt-1 truncate max-w-[170px]" title={summary?.least_efficient_vehicle?.model}>
              {summary?.least_efficient_vehicle?.model || '—'}
            </div>
            <div className="text-[11px] text-rose-600 font-bold mt-0.5">
              {summary?.least_efficient_vehicle?.actual_mileage} km/L ({summary?.least_efficient_vehicle?.deviation_percent}%)
            </div>
          </div>
          <div className="h-12 w-12 rounded-2xl bg-rose-50 text-rose-600 flex items-center justify-center">
            <AlertTriangle className="h-6 w-6" />
          </div>
        </div>
      </div>

      {/* 2. Visual Analytics Section with Recharts */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Monthly Fuel Cost Trend (LineChart - 8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex items-center justify-between">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <TrendingUp className="h-4 w-4 text-teal-600" />
                Monthly Fuel Cost Trend (Last 6 Months)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Monthly fuel spend per vehicle across the fleet.
              </p>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Loading cost trend chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <LineChart data={monthlyTrend} margin={{ top: 10, right: 20, left: 10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="month" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis
                    tick={{ fontSize: 11, fill: '#64748b' }}
                    tickFormatter={(val) => `₹${val >= 1000 ? `${val / 1000}k` : val}`}
                  />
                  <Tooltip
                    formatter={(val, name) => [`₹${Number(val).toLocaleString()}`, name]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                  {vehicles.map((v, idx) => (
                    <Line
                      key={v.id}
                      type="monotone"
                      dataKey={v.plate_number}
                      name={`${v.model.split(' ')[0]} (${v.plate_number})`}
                      stroke={VEHICLE_COLORS[idx % VEHICLE_COLORS.length]}
                      strokeWidth={2.5}
                      dot={{ r: 3 }}
                      activeDot={{ r: 5 }}
                    />
                  ))}
                </LineChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Total Liters Consumed per Vehicle (BarChart - 4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Fuel className="h-4 w-4 text-emerald-600" />
              Total Fuel Volume by Vehicle
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Cumulative liters filled.
            </p>
          </div>

          <div className="h-72 w-full pt-2">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Loading volume chart...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={litersPerVehicle} margin={{ top: 10, right: 10, left: -10, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis
                    dataKey="plate_number"
                    tick={{ fontSize: 10, fill: '#64748b' }}
                    tickFormatter={(val) => val.slice(-4)}
                  />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} />
                  <Tooltip
                    formatter={(val, name, props) => [`${val} Liters (₹${props.payload.total_cost?.toLocaleString()})`, props.payload.model]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                  />
                  <Bar dataKey="total_liters" radius={[6, 6, 0, 0]}>
                    {litersPerVehicle.map((entry, index) => (
                      <Cell key={`cell-${index}`} fill={VEHICLE_COLORS[index % VEHICLE_COLORS.length]} />
                    ))}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>
      </div>

      {/* 3. Efficiency Benchmark & Cost-per-Route Strip */}
      <div className="grid grid-cols-1 lg:grid-cols-12 gap-6">
        {/* Efficiency Chart: Rated vs Actual (8 cols) */}
        <div className="lg:col-span-8 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
            <div>
              <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
                <Gauge className="h-4 w-4 text-teal-600" />
                Vehicle Mileage Benchmarking: Rated vs Actual (km/L)
              </h3>
              <p className="text-[11px] text-slate-500 mt-0.5">
                Computed from consecutive odometer logs. Vehicles performing &gt;15% below rated are highlighted in red.
              </p>
            </div>
            <div className="flex items-center gap-3 text-[11px] font-semibold">
              <span className="flex items-center gap-1 text-slate-600">
                <span className="w-2.5 h-2.5 rounded bg-slate-300 inline-block"></span> Rated Mileage
              </span>
              <span className="flex items-center gap-1 text-emerald-600">
                <span className="w-2.5 h-2.5 rounded bg-emerald-500 inline-block"></span> Optimal (&ge; -5%)
              </span>
              <span className="flex items-center gap-1 text-rose-600">
                <span className="w-2.5 h-2.5 rounded bg-rose-500 inline-block"></span> Alert (&lt; -15%)
              </span>
            </div>
          </div>

          <div className="h-72 w-full pt-2">
            {loading ? (
              <div className="h-full flex items-center justify-center text-xs text-slate-400">
                Loading efficiency benchmarks...
              </div>
            ) : (
              <ResponsiveContainer width="100%" height="100%">
                <BarChart data={vehicleEfficiency} margin={{ top: 10, right: 20, left: -5, bottom: 5 }}>
                  <CartesianGrid strokeDasharray="3 3" stroke="#f1f5f9" />
                  <XAxis dataKey="plate_number" tick={{ fontSize: 11, fill: '#64748b' }} />
                  <YAxis tick={{ fontSize: 11, fill: '#64748b' }} unit=" km/L" />
                  <Tooltip
                    formatter={(val, name, item) => [
                      `${val} km/L (${item.payload.deviation_percent > 0 ? '+' : ''}${item.payload.deviation_percent}% deviation)`,
                      name === 'rated_mileage' ? 'Rated Mileage' : 'Actual Mileage'
                    ]}
                    contentStyle={{ backgroundColor: '#0f172a', borderRadius: '12px', color: '#fff', fontSize: '11px', border: 'none' }}
                  />
                  <Legend wrapperStyle={{ fontSize: '11px' }} />
                  <Bar dataKey="rated_mileage" name="Rated Mileage" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                  <Bar dataKey="actual_mileage" name="Actual Mileage" radius={[4, 4, 0, 0]}>
                    {vehicleEfficiency.map((entry, index) => {
                      let fillColor = '#10b981'; // Green (Good)
                      if (entry.deviation_percent < -15) {
                        fillColor = '#ef4444'; // Red (Alert >15% worse)
                      } else if (entry.deviation_percent < -5) {
                        fillColor = '#f59e0b'; // Amber (Check)
                      }
                      return <Cell key={`eff-cell-${index}`} fill={fillColor} />;
                    })}
                  </Bar>
                </BarChart>
              </ResponsiveContainer>
            )}
          </div>
        </div>

        {/* Cost-per-Route Metric Cards (4 cols) */}
        <div className="lg:col-span-4 bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <RouteIcon className="h-4 w-4 text-teal-600" />
              Route Cost-per-Kilometer
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Operational fuel expense per route km.
            </p>
          </div>

          <div className="space-y-2.5 max-h-72 overflow-y-auto pr-1">
            {costPerRoute.length === 0 ? (
              <div className="py-12 text-center text-xs text-slate-400">
                No completed routes with linked fuel logs yet.
              </div>
            ) : (
              costPerRoute.map((r) => (
                <div
                  key={r.log_id}
                  className="p-3 bg-slate-50/80 rounded-xl border border-slate-100 flex items-center justify-between text-xs"
                >
                  <div className="space-y-0.5">
                    <div className="font-bold text-slate-900 truncate max-w-[150px]">{r.route_name}</div>
                    <div className="text-[10px] text-slate-500">
                      {r.total_distance_km} km • {r.liters_filled} L • ₹{r.cost}
                    </div>
                  </div>
                  <div className="text-right">
                    <span className="font-mono font-bold text-teal-700 bg-teal-50 px-2 py-0.5 rounded text-[11px]">
                      ₹{r.cost_per_km}/km
                    </span>
                  </div>
                </div>
              ))
            )}
          </div>
        </div>
      </div>

      {/* 4. Vehicle Health Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
        <div className="flex items-center justify-between">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <ShieldCheck className="h-4 w-4 text-teal-600" />
              Fleet Vehicle Health & Efficiency Status
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Live deviation status and health assessments based on historical fuel telemetry.
            </p>
          </div>
        </div>

        <div className="overflow-x-auto">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-3 px-4">Vehicle</th>
                <th className="py-3 px-4">Fuel Type</th>
                <th className="py-3 px-4">Rated Mileage</th>
                <th className="py-3 px-4">Actual Mileage</th>
                <th className="py-3 px-4">Deviation %</th>
                <th className="py-3 px-4">Telemetry Distance</th>
                <th className="py-3 px-4">Health Status</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {vehicleEfficiency.map((veh) => {
                const statusBadge = {
                  Good: 'bg-emerald-50 text-emerald-700 border-emerald-200',
                  Check: 'bg-amber-50 text-amber-700 border-amber-200',
                  Alert: 'bg-rose-50 text-rose-700 border-rose-200 animate-pulse font-extrabold'
                };

                return (
                  <tr key={veh.vehicle_id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{veh.model}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{veh.plate_number}</div>
                    </td>
                    <td className="py-3 px-4 text-slate-600">{veh.fuel_type}</td>
                    <td className="py-3 px-4 font-semibold text-slate-700">{veh.rated_mileage} km/L</td>
                    <td className="py-3 px-4 font-bold text-slate-900">{veh.actual_mileage} km/L</td>
                    <td className="py-3 px-4">
                      <span
                        className={`font-bold ${
                          veh.deviation_percent < -15
                            ? 'text-rose-600'
                            : veh.deviation_percent < -5
                            ? 'text-amber-600'
                            : 'text-emerald-600'
                        }`}
                      >
                        {veh.deviation_percent > 0 ? '+' : ''}
                        {veh.deviation_percent}%
                      </span>
                    </td>
                    <td className="py-3 px-4 text-slate-500">
                      {veh.total_km} km ({veh.total_liters} L)
                    </td>
                    <td className="py-3 px-4">
                      <span
                        className={`inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[10px] font-bold border uppercase tracking-wide ${
                          statusBadge[veh.status] || 'bg-slate-100 text-slate-700'
                        }`}
                      >
                        {veh.status === 'Alert' && <AlertTriangle className="h-3 w-3 text-rose-600" />}
                        {veh.status === 'Good' && <CheckCircle2 className="h-3 w-3 text-emerald-600" />}
                        {veh.status}
                        {veh.status === 'Alert' && ' (Service Required)'}
                      </span>
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </div>

      {/* 5. Fuel Log Management Table */}
      <div className="bg-white rounded-2xl border border-slate-200/90 p-5 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h3 className="text-xs font-bold uppercase tracking-wider text-slate-900 flex items-center gap-2">
              <Calendar className="h-4 w-4 text-teal-600" />
              Fuel Log Management Records
            </h3>
            <p className="text-[11px] text-slate-500 mt-0.5">
              Historical logs with vehicle plates, liters, cost, odometer, and route references.
            </p>
          </div>

          <div className="flex flex-wrap items-center gap-3">
            {/* Search */}
            <div className="relative">
              <Search className="h-3.5 w-3.5 absolute left-3 top-2.5 text-slate-400" />
              <input
                type="text"
                value={search}
                onChange={(e) => setSearch(e.target.value)}
                placeholder="Search logs..."
                className="pl-8 pr-3 py-1.5 text-xs bg-slate-50 border border-slate-200 rounded-lg text-slate-800 placeholder-slate-400 focus:outline-none focus:ring-2 focus:ring-teal-500"
              />
            </div>

            {/* Vehicle Filter Dropdown */}
            <select
              value={vehicleFilter}
              onChange={(e) => setVehicleFilter(e.target.value)}
              className="text-xs px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-lg text-slate-700 focus:outline-none focus:ring-2 focus:ring-teal-500"
            >
              <option value="all">All Vehicles</option>
              {vehicles.map((v) => (
                <option key={v.id} value={v.id}>
                  {v.plate_number} ({v.model.split(' ')[0]})
                </option>
              ))}
            </select>
          </div>
        </div>

        <div className="overflow-x-auto max-h-96">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-slate-600 font-semibold border-b border-slate-200 sticky top-0 z-10">
              <tr>
                <th className="py-3 px-4">Date</th>
                <th className="py-3 px-4">Vehicle</th>
                <th className="py-3 px-4">Liters Filled</th>
                <th className="py-3 px-4">Cost (₹)</th>
                <th className="py-3 px-4">Odometer</th>
                <th className="py-3 px-4">Linked Route</th>
                <th className="py-3 px-4 text-right">Actions</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100">
              {tableLoading ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400">
                    Loading logs...
                  </td>
                </tr>
              ) : filteredLogs.length === 0 ? (
                <tr>
                  <td colSpan="7" className="py-8 text-center text-slate-400">
                    No fuel logs found.
                  </td>
                </tr>
              ) : (
                filteredLogs.map((log) => (
                  <tr key={log.id} className="hover:bg-slate-50/70 transition-colors">
                    <td className="py-3 px-4 font-mono text-slate-600">{log.log_date}</td>
                    <td className="py-3 px-4">
                      <div className="font-bold text-slate-900">{log.model}</div>
                      <div className="text-[11px] text-slate-400 font-mono">{log.plate_number}</div>
                    </td>
                    <td className="py-3 px-4 font-bold text-slate-900">{log.liters_filled} L</td>
                    <td className="py-3 px-4 font-bold text-emerald-700">₹{Number(log.cost).toLocaleString()}</td>
                    <td className="py-3 px-4 font-mono text-slate-600">{Number(log.odometer_km).toLocaleString()} km</td>
                    <td className="py-3 px-4 text-slate-600">
                      {log.route_name ? (
                        <span className="text-teal-700 font-medium truncate max-w-[150px] inline-block" title={log.route_name}>
                          {log.route_name}
                        </span>
                      ) : (
                        <span className="text-slate-400 italic">Depot Refuel</span>
                      )}
                    </td>
                    <td className="py-3 px-4 text-right">
                      <div className="flex items-center justify-end gap-2">
                        <button
                          type="button"
                          onClick={() => openLogModal(log)}
                          className="p-1 text-slate-400 hover:text-teal-600 transition-colors rounded"
                          title="Edit Log"
                        >
                          <Edit2 className="h-3.5 w-3.5" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteLog(log.id)}
                          className="p-1 text-slate-400 hover:text-rose-600 transition-colors rounded"
                          title="Delete Log"
                        >
                          <Trash2 className="h-3.5 w-3.5" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))
              )}
            </tbody>
          </table>
        </div>
      </div>

      {/* Add / Edit Fuel Log Modal */}
      {isModalOpen && (
        <div className="fixed inset-0 z-50 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-md w-full shadow-2xl border border-slate-200 overflow-hidden">
            <div className="p-5 border-b border-slate-100 flex items-center justify-between bg-slate-50/80">
              <h3 className="text-sm font-bold text-slate-900 flex items-center gap-2">
                <Fuel className="h-4 w-4 text-teal-600" />
                {editingLog ? 'Edit Fuel Log Entry' : 'Record New Fuel Log'}
              </h3>
              <button
                type="button"
                onClick={() => setIsModalOpen(false)}
                className="text-slate-400 hover:text-slate-600 p-1"
              >
                <X className="h-4 w-4" />
              </button>
            </div>

            <form onSubmit={handleFormSubmit} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Fleet Vehicle *
                </label>
                <select
                  required
                  value={formData.vehicle_id}
                  onChange={(e) => setFormData({ ...formData, vehicle_id: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  {vehicles.map((v) => (
                    <option key={v.id} value={v.id}>
                      {v.model} - {v.plate_number} ({v.avg_mileage_kmpl} km/L)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block text-xs font-bold text-slate-700 mb-1">
                  Linked Collection Route (Optional)
                </label>
                <select
                  value={formData.route_id}
                  onChange={(e) => setFormData({ ...formData, route_id: e.target.value })}
                  className="w-full text-xs px-3 py-2 bg-slate-50 border border-slate-300 rounded-lg text-slate-800 focus:outline-none focus:ring-2 focus:ring-teal-500"
                >
                  <option value="">-- No Route (Standard Refueling) --</option>
                  {routes.map((r) => (
                    <option key={r.id} value={r.id}>
                      {r.name} ({r.total_distance_km} km)
                    </option>
                  ))}
                </select>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Liters Filled *
                  </label>
                  <input
                    type="number"
                    step="0.1"
                    required
                    min="0"
                    value={formData.liters_filled}
                    onChange={(e) => {
                      const liters = e.target.value;
                      setFormData({
                        ...formData,
                        liters_filled: liters,
                        cost: liters ? String(Math.round(Number(liters) * 94.5)) : ''
                      });
                    }}
                    placeholder="e.g. 50"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-bold"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Total Cost (₹)
                  </label>
                  <input
                    type="number"
                    value={formData.cost}
                    onChange={(e) => setFormData({ ...formData, cost: e.target.value })}
                    placeholder="Auto (₹94.5/L)"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>
              </div>

              <div className="grid grid-cols-2 gap-3">
                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Odometer Reading (km) *
                  </label>
                  <input
                    type="number"
                    required
                    min="0"
                    value={formData.odometer_km}
                    onChange={(e) => setFormData({ ...formData, odometer_km: e.target.value })}
                    placeholder="e.g. 14500"
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500 font-mono"
                  />
                </div>

                <div>
                  <label className="block text-xs font-bold text-slate-700 mb-1">
                    Log Date *
                  </label>
                  <input
                    type="date"
                    required
                    value={formData.log_date}
                    onChange={(e) => setFormData({ ...formData, log_date: e.target.value })}
                    className="w-full text-xs px-3 py-2 border border-slate-300 rounded-lg focus:outline-none focus:ring-2 focus:ring-teal-500"
                  />
                </div>
              </div>

              <div className="pt-3 border-t border-slate-100 flex items-center justify-end gap-2">
                <button
                  type="button"
                  onClick={() => setIsModalOpen(false)}
                  className="px-4 py-2 text-xs font-semibold text-slate-600 hover:text-slate-800 rounded-lg"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  disabled={submitting}
                  className="px-4 py-2 text-xs font-bold text-white bg-teal-600 hover:bg-teal-700 rounded-lg shadow-xs"
                >
                  {submitting ? 'Saving...' : editingLog ? 'Save Changes' : 'Record Fuel Log'}
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
