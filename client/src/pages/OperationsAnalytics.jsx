import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import {
  AreaChart,
  Area,
  BarChart,
  Bar,
  XAxis,
  YAxis,
  CartesianGrid,
  Tooltip,
  ResponsiveContainer,
  Legend,
  Cell
} from 'recharts';
import {
  BarChart3,
  Clock,
  CheckCircle2,
  AlertTriangle,
  TrendingUp,
  ShieldCheck,
  Calendar,
  Sparkles,
  RefreshCw,
  Route,
  MessageSquareWarning,
  Flame
} from 'lucide-react';

export default function OperationsAnalytics() {
  const [data, setData] = useState(null);
  const [loading, setLoading] = useState(true);
  const [timeRange, setTimeRange] = useState('14d');

  const fetchAnalytics = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/analytics/operations');
      if (res.ok) {
        const json = await res.json();
        setData(json);
      }
    } catch (err) {
      console.error('Failed to load operational analytics:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchAnalytics();
  }, []);

  if (loading || !data) {
    return (
      <div className="flex flex-col items-center justify-center min-h-[400px] text-slate-400 text-xs">
        <div className="w-7 h-7 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mb-3"></div>
        <span>Aggregating municipal operations & SLA telemetry...</span>
      </div>
    );
  }

  const { summary, collections_trend, sla_benchmarks, priority_breakdown, complaint_breakdown } = data;

  const priorityColors = {
    urgent: '#ef4444',
    high: '#f59e0b',
    normal: '#10b981'
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 dark:border-slate-800 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 dark:text-white flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-400 rounded-xl">
              <BarChart3 className="h-6 w-6" />
            </div>
            Operations & Service Turnaround Analytics
          </h2>
          <p className="text-xs text-slate-500 dark:text-slate-400 mt-1">
            Real-time performance benchmarks: daily collections volume, request-to-pickup latency, and citizen grievance resolution time.
          </p>
        </div>

        <div className="flex items-center gap-2 self-start sm:self-auto">
          <button
            onClick={fetchAnalytics}
            className="p-2 bg-white dark:bg-slate-900 hover:bg-slate-50 dark:hover:bg-slate-800 border border-slate-200 dark:border-slate-800 text-slate-600 dark:text-slate-300 rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center gap-1.5 cursor-pointer"
            title="Refresh operational telemetry"
          >
            <RefreshCw className="h-4 w-4" />
            <span className="hidden sm:inline">Refresh</span>
          </button>
        </div>
      </div>

      {/* 4 Core Summary Metric KPI Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-4 gap-4">
        {/* Avg Request-to-Completion Time */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Avg Pickup Turnaround
            </span>
            <div className="p-2 bg-teal-50 dark:bg-teal-950/60 text-teal-600 dark:text-teal-400 rounded-xl">
              <Clock className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-slate-900 dark:text-white">
            {summary.avg_request_completion_hours} <span className="text-sm font-semibold text-slate-400">hours</span>
          </div>
          <div className="mt-1 flex items-center gap-1.5 text-[11px] text-teal-600 dark:text-teal-400 font-semibold">
            <Flame className="h-3.5 w-3.5 text-rose-500" />
            <span>Urgent: {summary.avg_urgent_completion_hours} hrs</span>
          </div>
        </div>

        {/* Avg Complaint Resolution Time */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-amber-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Avg Complaint Resolution
            </span>
            <div className="p-2 bg-amber-50 dark:bg-amber-950/60 text-amber-600 dark:text-amber-400 rounded-xl">
              <MessageSquareWarning className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-amber-600 dark:text-amber-400">
            {summary.avg_complaint_resolution_hours} <span className="text-sm font-semibold text-slate-400">hours</span>
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            From filing to municipal sign-off
          </div>
        </div>

        {/* Total Collections Completed */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-emerald-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              Collections Fulfilled
            </span>
            <div className="p-2 bg-emerald-50 dark:bg-emerald-950/60 text-emerald-600 dark:text-emerald-400 rounded-xl">
              <CheckCircle2 className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-emerald-600 dark:text-emerald-400">
            {summary.total_completed_collections} <span className="text-sm font-semibold text-slate-400">bins</span>
          </div>
          <div className="mt-1 text-[11px] text-emerald-600 dark:text-emerald-400 font-semibold flex items-center gap-1">
            <TrendingUp className="h-3.5 w-3.5" />
            <span>Optimal 2-Opt fleet routing</span>
          </div>
        </div>

        {/* SLA Compliance Rate */}
        <div className="bg-white dark:bg-slate-900 p-5 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs hover:border-cyan-400 transition-all">
          <div className="flex items-center justify-between">
            <span className="text-[11px] font-bold text-slate-500 dark:text-slate-400 uppercase tracking-wider">
              SLA Compliance
            </span>
            <div className="p-2 bg-cyan-50 dark:bg-cyan-950/60 text-cyan-600 dark:text-cyan-400 rounded-xl">
              <ShieldCheck className="h-5 w-5" />
            </div>
          </div>
          <div className="mt-3 text-2xl font-black text-cyan-600 dark:text-cyan-400">
            {summary.sla_compliance_percent}%
          </div>
          <div className="mt-1 text-[11px] text-slate-500 dark:text-slate-400 font-medium">
            Municipal standard target: &ge;90%
          </div>
        </div>
      </div>

      {/* Primary Chart: Collections Per Day */}
      <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Route className="h-5 w-5 text-emerald-600 dark:text-emerald-400" />
              Daily Waste Collections Volume
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Number of bins successfully emptied and reset by field drivers across Bengaluru routes.
            </p>
          </div>
          <span className="text-[11px] font-bold px-2.5 py-1 rounded-lg bg-emerald-50 dark:bg-emerald-950/60 text-emerald-700 dark:text-emerald-300 border border-emerald-200 dark:border-emerald-800 self-start sm:self-auto">
            7-Day Operational Trend
          </span>
        </div>

        <div className="h-72 w-full pt-4">
          <ResponsiveContainer width="100%" height="100%">
            <AreaChart data={collections_trend} margin={{ top: 10, right: 20, left: -10, bottom: 0 }}>
              <defs>
                <linearGradient id="collectionsGradient" x1="0" y1="0" x2="0" y2="1">
                  <stop offset="5%" stopColor="#10b981" stopOpacity={0.4} />
                  <stop offset="95%" stopColor="#10b981" stopOpacity={0.0} />
                </linearGradient>
              </defs>
              <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
              <XAxis
                dataKey="displayDate"
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <YAxis
                allowDecimals={false}
                tick={{ fontSize: 11, fill: '#64748b' }}
                axisLine={{ stroke: '#cbd5e1' }}
              />
              <Tooltip
                contentStyle={{
                  backgroundColor: '#0f172a',
                  borderColor: '#334155',
                  borderRadius: '12px',
                  color: '#fff',
                  fontSize: '12px',
                  fontWeight: 'bold'
                }}
                formatter={(val) => [`${val} Bins Collected`, 'Collections']}
                labelFormatter={(label) => `Date: ${label}`}
              />
              <Area
                type="monotone"
                dataKey="collections"
                stroke="#10b981"
                strokeWidth={3}
                fillOpacity={1}
                fill="url(#collectionsGradient)"
                name="Bins Collected"
              />
            </AreaChart>
          </ResponsiveContainer>
        </div>
      </div>

      {/* 2-Column Grid: SLA Benchmarks Table & Priority Distribution */}
      <div className="grid grid-cols-1 lg:grid-cols-2 gap-6">
        {/* Turnaround SLA Benchmarks */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <Clock className="h-5 w-5 text-teal-600 dark:text-teal-400" />
              Service Level Agreement (SLA) Turnaround
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Average turnaround latency vs municipal commitment targets.
            </p>
          </div>

          <div className="space-y-3 pt-2">
            {sla_benchmarks.map((sla, idx) => (
              <div
                key={idx}
                className="p-4 bg-slate-50 dark:bg-slate-800/50 rounded-xl border border-slate-200 dark:border-slate-700/60 flex items-center justify-between gap-3"
              >
                <div>
                  <div className="text-xs font-bold text-slate-900 dark:text-white">{sla.metric}</div>
                  <div className="text-[11px] text-slate-500 dark:text-slate-400 mt-0.5">
                    Target: &le; {sla.targetHours} {sla.unit}
                  </div>
                </div>

                <div className="text-right">
                  <div className="text-base font-black text-slate-900 dark:text-white">
                    {sla.actualHours} <span className="text-xs font-semibold text-slate-400">{sla.unit}</span>
                  </div>
                  <span className="inline-block mt-0.5 text-[10px] font-bold px-2 py-0.5 rounded-full bg-emerald-100 dark:bg-emerald-950 text-emerald-800 dark:text-emerald-300">
                    {sla.status}
                  </span>
                </div>
              </div>
            ))}
          </div>
        </div>

        {/* Complaints Resolution by Category BarChart */}
        <div className="bg-white dark:bg-slate-900 p-6 rounded-2xl border border-slate-200 dark:border-slate-800 shadow-xs space-y-4">
          <div>
            <h3 className="text-base font-bold text-slate-900 dark:text-white flex items-center gap-2">
              <MessageSquareWarning className="h-5 w-5 text-amber-600 dark:text-amber-400" />
              Grievances Resolution by Category
            </h3>
            <p className="text-xs text-slate-500 dark:text-slate-400 mt-0.5">
              Reported vs resolved issues filed through citizen channels.
            </p>
          </div>

          <div className="h-64 w-full pt-2">
            <ResponsiveContainer width="100%" height="100%">
              <BarChart
                data={complaint_breakdown.map((c) => ({
                  name: c.type?.replace('_', ' ').toUpperCase(),
                  Reported: c.count,
                  Resolved: c.resolved_count
                }))}
                margin={{ top: 10, right: 10, left: -15, bottom: 25 }}
              >
                <CartesianGrid strokeDasharray="3 3" stroke="#e2e8f0" strokeOpacity={0.5} />
                <XAxis
                  dataKey="name"
                  tick={{ fontSize: 9, fill: '#64748b' }}
                  interval={0}
                  angle={-15}
                  textAnchor="end"
                />
                <YAxis allowDecimals={false} tick={{ fontSize: 11, fill: '#64748b' }} />
                <Tooltip
                  contentStyle={{
                    backgroundColor: '#0f172a',
                    borderColor: '#334155',
                    borderRadius: '10px',
                    color: '#fff',
                    fontSize: '11px'
                  }}
                />
                <Legend wrapperStyle={{ fontSize: '11px', paddingTop: '10px' }} />
                <Bar dataKey="Reported" fill="#cbd5e1" radius={[4, 4, 0, 0]} />
                <Bar dataKey="Resolved" fill="#0d9488" radius={[4, 4, 0, 0]} />
              </BarChart>
            </ResponsiveContainer>
          </div>
        </div>
      </div>
    </div>
  );
}
