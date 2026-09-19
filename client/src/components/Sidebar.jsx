import React from 'react';
import { NavLink } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  LayoutDashboard,
  Trash2,
  Route,
  Users,
  Truck,
  Fuel,
  MessageSquareWarning,
  Recycle,
  User,
  Bell,
  MapPin,
  FileText,
  Send,
  Sparkles,
  X,
  BarChart3
} from 'lucide-react';

const adminNavigation = [
  { name: 'Dashboard', path: '/', icon: LayoutDashboard },
  { name: 'Bins', path: '/bins', icon: Trash2 },
  { name: 'Routes', path: '/routes', icon: Route },
  { name: 'Drivers', path: '/drivers', icon: Users },
  { name: 'Vehicles', path: '/vehicles', icon: Truck },
  { name: 'Fuel Analytics', path: '/fuel-analytics', icon: Fuel },
  { name: 'Operations Analytics', path: '/operations-analytics', icon: BarChart3 },
  { name: 'Complaints', path: '/complaints', icon: MessageSquareWarning },
];

const driverNavigation = [
  { name: 'My Routes', path: '/driver/routes', icon: Route },
  { name: 'My Profile', path: '/driver/profile', icon: User },
  { name: 'Notifications', path: '/driver/notifications', icon: Bell },
];

const citizenNavigation = [
  { name: 'Report Complaint', path: '/citizen/report', icon: Send },
  { name: 'My Complaints', path: '/citizen/complaints', icon: FileText },
  { name: 'Nearby Bins', path: '/citizen/bins', icon: MapPin },
];

export default function Sidebar({ isOpen, onClose }) {
  const { user } = useAuth();

  let navigationItems = adminNavigation;
  let consoleTitle = 'Admin Console';

  if (user?.role === 'driver') {
    navigationItems = driverNavigation;
    consoleTitle = 'Driver Portal';
  } else if (user?.role === 'citizen') {
    navigationItems = citizenNavigation;
    consoleTitle = 'Citizen Services';
  }

  return (
    <>
      {/* Mobile Backdrop */}
      {isOpen && (
        <div
          onClick={onClose}
          className="fixed inset-0 bg-slate-950/60 backdrop-blur-xs z-30 lg:hidden transition-opacity"
        />
      )}

      {/* Sidebar Element */}
      <aside
        className={`w-64 bg-slate-900 text-slate-300 flex flex-col shrink-0 min-h-screen border-r border-slate-800 shadow-2xl z-40 fixed lg:static top-0 bottom-0 left-0 transition-transform duration-300 ease-in-out ${
          isOpen ? 'translate-x-0' : '-translate-x-full lg:translate-x-0'
        }`}
      >
        {/* Brand Header */}
        <div className="h-16 px-6 flex items-center justify-between border-b border-slate-800 bg-emerald-950/40">
          <div className="flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center text-white shadow-lg shadow-emerald-900/30">
              <Recycle className="h-6 w-6 animate-pulse" />
            </div>
            <div>
              <h1 className="font-bold text-white tracking-wide text-lg leading-none">
                Smart<span className="text-teal-400">Waste</span>
              </h1>
              <p className="text-[10px] text-teal-300/70 tracking-wider uppercase font-semibold mt-1">
                Eco Optimization System
              </p>
            </div>
          </div>

          {/* Close button for mobile */}
          <button
            type="button"
            onClick={onClose}
            className="p-1 text-slate-400 hover:text-white lg:hidden rounded-lg hover:bg-slate-800"
          >
            <X className="h-5 w-5" />
          </button>
        </div>

        {/* Navigation Links */}
        <nav className="flex-1 px-3 py-6 space-y-1 overflow-y-auto">
          <div className="px-3 pb-2 text-[11px] font-semibold text-slate-400 uppercase tracking-wider">
            {consoleTitle}
          </div>

          {navigationItems.map((item) => {
            const Icon = item.icon;
            return (
              <NavLink
                key={item.name}
                to={item.path}
                onClick={onClose}
                className={({ isActive }) =>
                  `flex items-center gap-3 px-3.5 py-2.5 rounded-lg text-sm font-medium transition-all duration-150 group ${
                    isActive
                      ? 'bg-gradient-to-r from-emerald-600 to-teal-600 text-white shadow-md shadow-emerald-900/20'
                      : 'text-slate-400 hover:text-white hover:bg-slate-800/60'
                  }`
                }
              >
                {({ isActive }) => (
                  <>
                    <Icon
                      className={`h-5 w-5 transition-transform duration-200 group-hover:scale-110 ${
                        isActive ? 'text-white' : 'text-slate-400 group-hover:text-teal-400'
                      }`}
                    />
                    <span>{item.name}</span>
                  </>
                )}
              </NavLink>
            );
          })}
        </nav>

        {/* System Status Footprint */}
        <div className="p-4 border-t border-slate-800 bg-slate-950/50">
          <div className="bg-slate-900/90 rounded-lg p-3 border border-emerald-500/20">
            <div className="flex items-center gap-2 mb-1">
              <Sparkles className="h-4 w-4 text-teal-400" />
              <span className="text-xs font-semibold text-slate-200">System Mode</span>
            </div>
            <p className="text-[11px] font-medium text-emerald-400 capitalize">
              Logged in as {user?.role || 'Guest'}
            </p>
          </div>
        </div>
      </aside>
    </>
  );
}
