import React, { useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Recycle,
  Trash2,
  Route,
  Truck,
  Fuel,
  MessageSquareWarning,
  ArrowRight,
  ShieldCheck,
  CheckCircle2,
  Cpu,
  Sparkles,
  MapPin,
  BarChart3,
  TrendingUp,
  Key,
  Users,
  Send,
  Zap
} from 'lucide-react';

export default function Landing() {
  const { user, login } = useAuth();
  const navigate = useNavigate();
  const [demoLoading, setDemoLoading] = useState('');

  const handleQuickLogin = async (email, role) => {
    try {
      setDemoLoading(role);
      const res = await login(email, 'password123');
      if (res.success) {
        if (role === 'admin') navigate('/');
        else if (role === 'driver') navigate('/driver/routes');
        else if (role === 'citizen') navigate('/citizen/bins');
      }
    } catch (err) {
      console.error(err);
    } finally {
      setDemoLoading('');
    }
  };

  return (
    <div className="min-h-screen bg-slate-950 text-slate-100 selection:bg-teal-500 selection:text-white flex flex-col font-sans">
      {/* Public Navigation Header */}
      <header className="border-b border-slate-800/80 bg-slate-950/80 backdrop-blur-md sticky top-0 z-50">
        <div className="max-w-7xl mx-auto px-6 h-18 flex items-center justify-between">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-500 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-500/20">
              <Recycle className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <span className="text-xl font-black tracking-tight text-white">
                Smart<span className="text-teal-400">Waste</span>
              </span>
              <span className="hidden sm:inline-block ml-2 text-[10px] uppercase tracking-wider font-bold text-teal-300/80 bg-teal-950/70 border border-teal-800/60 px-2 py-0.5 rounded-full">
                Eco Optimization
              </span>
            </div>
          </div>

          <div className="flex items-center gap-3">
            {user ? (
              <Link
                to={user.role === 'driver' ? '/driver/routes' : user.role === 'citizen' ? '/citizen/bins' : '/'}
                className="inline-flex items-center gap-2 px-5 py-2.5 rounded-xl font-bold text-xs bg-teal-500 hover:bg-teal-400 text-slate-950 transition-all shadow-md shadow-teal-500/20"
              >
                Go to {user.role.toUpperCase()} Console <ArrowRight className="h-4 w-4" />
              </Link>
            ) : (
              <>
                <Link
                  to="/login"
                  className="px-4 py-2 text-xs font-semibold text-slate-300 hover:text-white transition-colors"
                >
                  Sign In
                </Link>
                <Link
                  to="/register"
                  className="inline-flex items-center gap-1.5 px-4 py-2 rounded-xl text-xs font-bold bg-teal-500 hover:bg-teal-400 text-slate-950 shadow-md shadow-teal-500/20 transition-all active:scale-95"
                >
                  Citizen Register
                </Link>
              </>
            )}
          </div>
        </div>
      </header>

      {/* Hero Section */}
      <section className="relative overflow-hidden pt-16 pb-24 lg:pt-24 lg:pb-32">
        {/* Ambient Gradient Glows */}
        <div className="absolute top-1/4 left-1/2 -translate-x-1/2 -translate-y-1/2 w-[650px] h-[350px] bg-emerald-500/15 rounded-full blur-3xl pointer-events-none"></div>
        <div className="absolute top-1/3 right-10 w-[450px] h-[300px] bg-teal-500/10 rounded-full blur-3xl pointer-events-none"></div>

        <div className="max-w-7xl mx-auto px-6 relative z-10 text-center">
          <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-emerald-950/80 border border-emerald-500/30 text-emerald-300 text-xs font-bold uppercase tracking-wider mb-6 shadow-inner">
            <Sparkles className="h-3.5 w-3.5 text-teal-400" />
            AI-Assisted Municipal Waste System
          </div>

          <h1 className="text-4xl sm:text-6xl lg:text-7xl font-black text-white tracking-tight leading-[1.1] max-w-5xl mx-auto">
            Clean Cities Powered by{' '}
            <span className="bg-clip-text text-transparent bg-gradient-to-r from-emerald-400 via-teal-300 to-cyan-400">
              Real-Time IoT & 2-Opt TSP
            </span>
          </h1>

          <p className="mt-6 text-base sm:text-lg text-slate-400 max-w-2xl mx-auto leading-relaxed">
            SmartWaste transforms civic collection logistics: automated IoT bin alerts, shortest-path 2-opt vehicle dispatch from municipal depots, fuel consumption analytics, and citizen grievance redressal.
          </p>

          {/* Call to Actions */}
          <div className="mt-10 flex flex-wrap items-center justify-center gap-4">
            <Link
              to="/login"
              className="px-7 py-3.5 rounded-xl font-bold text-sm bg-gradient-to-r from-teal-500 to-emerald-500 hover:from-teal-400 hover:to-emerald-400 text-slate-950 shadow-xl shadow-teal-500/25 transition-all active:scale-95 flex items-center gap-2"
            >
              Enter System Console <ArrowRight className="h-4 w-4" />
            </Link>
            <Link
              to="/citizen/bins"
              className="px-6 py-3.5 rounded-xl font-semibold text-sm bg-slate-900/80 hover:bg-slate-800 text-slate-200 border border-slate-700 transition-all flex items-center gap-2"
            >
              <MapPin className="h-4 w-4 text-teal-400" /> Public Bins Map
            </Link>
          </div>

          {/* One-Click Demo Role Launcher */}
          <div className="mt-12 p-5 bg-slate-900/70 border border-slate-800 rounded-2xl max-w-3xl mx-auto shadow-2xl">
            <div className="flex items-center justify-center gap-2 text-xs font-bold text-slate-300 mb-3">
              <Zap className="h-4 w-4 text-amber-400" />
              One-Click Instant Demo Authentication (password: password123)
            </div>
            <div className="grid grid-cols-1 sm:grid-cols-3 gap-3">
              <button
                type="button"
                onClick={() => handleQuickLogin('admin@smartwaste.gov', 'admin')}
                disabled={!!demoLoading}
                className="p-3 rounded-xl bg-slate-800/90 hover:bg-emerald-950/80 border border-emerald-500/30 hover:border-emerald-500/60 text-left transition-all group cursor-pointer"
              >
                <div className="text-[10px] font-bold text-emerald-400 uppercase tracking-wider">Admin Role</div>
                <div className="text-xs font-bold text-white group-hover:text-emerald-300">
                  {demoLoading === 'admin' ? 'Logging in...' : 'admin@smartwaste.gov'}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Full Dispatch & Analytics</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('driver1@smartwaste.gov', 'driver')}
                disabled={!!demoLoading}
                className="p-3 rounded-xl bg-slate-800/90 hover:bg-teal-950/80 border border-teal-500/30 hover:border-teal-500/60 text-left transition-all group cursor-pointer"
              >
                <div className="text-[10px] font-bold text-teal-400 uppercase tracking-wider">Driver Role</div>
                <div className="text-xs font-bold text-white group-hover:text-teal-300">
                  {demoLoading === 'driver' ? 'Logging in...' : 'driver1@smartwaste.gov'}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Mobile Route Portal</div>
              </button>

              <button
                type="button"
                onClick={() => handleQuickLogin('citizen1@gmail.com', 'citizen')}
                disabled={!!demoLoading}
                className="p-3 rounded-xl bg-slate-800/90 hover:bg-cyan-950/80 border border-cyan-500/30 hover:border-cyan-500/60 text-left transition-all group cursor-pointer"
              >
                <div className="text-[10px] font-bold text-cyan-400 uppercase tracking-wider">Citizen Role</div>
                <div className="text-xs font-bold text-white group-hover:text-cyan-300">
                  {demoLoading === 'citizen' ? 'Logging in...' : 'citizen1@gmail.com'}
                </div>
                <div className="text-[10px] text-slate-400 mt-1">Grievances & Map</div>
              </button>
            </div>
          </div>
        </div>
      </section>

      {/* Live Impact Metrics Strip */}
      <section className="border-y border-slate-800/90 bg-slate-900/50 py-10">
        <div className="max-w-7xl mx-auto px-6 grid grid-cols-2 md:grid-cols-4 gap-6 text-center">
          <div>
            <div className="text-3xl sm:text-4xl font-black text-white">25+</div>
            <div className="text-xs font-bold text-emerald-400 mt-1 uppercase tracking-wider">IoT Sensor Bins</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Live fill simulation</div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-white">35%</div>
            <div className="text-xs font-bold text-teal-400 mt-1 uppercase tracking-wider">Distance Reduction</div>
            <div className="text-[11px] text-slate-500 mt-0.5">2-Opt local search TSP</div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-white">100%</div>
            <div className="text-xs font-bold text-cyan-400 mt-1 uppercase tracking-wider">Auto Dispatch</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Driver & vehicle matching</div>
          </div>
          <div>
            <div className="text-3xl sm:text-4xl font-black text-white">&lt; 24h</div>
            <div className="text-xs font-bold text-emerald-400 mt-1 uppercase tracking-wider">Grievance Turnaround</div>
            <div className="text-[11px] text-slate-500 mt-0.5">Photo verification loop</div>
          </div>
        </div>
      </section>

      {/* 5 Core Feature Modules */}
      <section className="py-20 max-w-7xl mx-auto px-6 space-y-12">
        <div className="text-center space-y-3 max-w-2xl mx-auto">
          <h2 className="text-2xl sm:text-4xl font-extrabold text-white tracking-tight">
            Comprehensive Waste Infrastructure
          </h2>
          <p className="text-xs sm:text-sm text-slate-400">
            Engineered to fulfill all 5 project objectives with real-time Socket.IO synchronization.
          </p>
        </div>

        <div className="grid grid-cols-1 md:grid-cols-2 lg:grid-cols-3 gap-6">
          {/* Feature 1 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all hover:bg-slate-900/90 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Trash2 className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">1. Real-Time IoT Bin Monitoring</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Interactive Leaflet maps with color-coded fill statuses, background sensor simulation (15s tick), and automatic threshold requests when capacity exceeds 80%.
            </p>
          </div>

          {/* Feature 2 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-teal-500/40 transition-all hover:bg-slate-900/90 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-teal-500/20 text-teal-400 flex items-center justify-center font-bold">
              <Route className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">2. 2-Opt Route Optimization</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Server-side Nearest Neighbor heuristic with 2-Opt local search uncrossing, Haversine spherical distance formulas, fixed depot loop, and polyline visualization.
            </p>
          </div>

          {/* Feature 3 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-cyan-500/40 transition-all hover:bg-slate-900/90 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-cyan-500/20 text-cyan-400 flex items-center justify-center font-bold">
              <Truck className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">3. Automated Driver Assignment</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Automatic pairing of available drivers and vehicles, mobile-responsive driver portal with turn-by-turn guidance, one-tap collections, and fuel logging on completion.
            </p>
          </div>

          {/* Feature 4 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-indigo-500/40 transition-all hover:bg-slate-900/90 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-indigo-500/20 text-indigo-400 flex items-center justify-center font-bold">
              <Fuel className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">4. Recharts Fuel Analytics</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Monthly vehicle cost trends, actual vs. rated mileage benchmarks, cost-per-km metrics, and automated vehicle health alerts when efficiency drops &gt;15%.
            </p>
          </div>

          {/* Feature 5 */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-amber-500/40 transition-all hover:bg-slate-900/90 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-amber-500/20 text-amber-400 flex items-center justify-center font-bold">
              <MessageSquareWarning className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">5. Citizen Complaint Portal</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Public grievance reporting with photo uploads and bin selector, real-time 3-stage resolution timelines, and one-click urgent request generation for admins.
            </p>
          </div>

          {/* Architecture / Tech */}
          <div className="p-6 rounded-2xl bg-slate-900/60 border border-slate-800 hover:border-emerald-500/40 transition-all hover:bg-slate-900/90 space-y-3">
            <div className="h-10 w-10 rounded-xl bg-emerald-500/20 text-emerald-400 flex items-center justify-center font-bold">
              <Cpu className="h-5 w-5" />
            </div>
            <h3 className="text-base font-bold text-white">High Performance Monorepo</h3>
            <p className="text-xs text-slate-400 leading-relaxed">
              Vite + React 19 frontend, Express backend, zero-config local better-sqlite3 database, and full Socket.IO event mesh.
            </p>
          </div>
        </div>
      </section>

      {/* Footer */}
      <footer className="mt-auto border-t border-slate-900 bg-slate-950 py-8 text-center text-xs text-slate-500">
        <div className="max-w-7xl mx-auto px-6 flex flex-col sm:flex-row items-center justify-between gap-4">
          <div className="flex items-center gap-2">
            <Recycle className="h-4 w-4 text-emerald-500" />
            <span className="text-slate-300 font-bold">SmartWaste System</span> • Municipal Eco Optimization
          </div>
          <div>
            Built with React, Vite, Express, SQLite, Leaflet & Recharts
          </div>
        </div>
      </footer>
    </div>
  );
}
