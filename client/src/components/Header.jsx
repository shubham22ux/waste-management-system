import React, { useEffect, useState, useRef } from 'react';
import { useAuth } from '../context/AuthContext';
import { useSocket } from '../context/SocketContext';
import { useTheme } from '../context/ThemeContext';
import { apiFetch } from '../api';
import { useNavigate } from 'react-router-dom';
import {
  Bell,
  Search,
  ShieldCheck,
  User,
  LogOut,
  Menu,
  CheckCheck,
  Clock,
  AlertTriangle,
  Info,
  X,
  ExternalLink,
  Sun,
  Moon
} from 'lucide-react';

export default function Header({ onToggleSidebar }) {
  const { user, logout } = useAuth();
  const { socket } = useSocket();
  const { isDark, toggleTheme } = useTheme();
  const navigate = useNavigate();

  const [serverHealth, setServerHealth] = useState({ status: 'checking', message: 'Connecting...' });
  const [notifications, setNotifications] = useState([]);
  const [unreadCount, setUnreadCount] = useState(0);
  const [isNotifOpen, setIsNotifOpen] = useState(false);
  const notifDropdownRef = useRef(null);

  // Health check
  useEffect(() => {
    fetch('/api/health')
      .then((res) => res.json())
      .then((data) => {
        const isMongoOk = data.mongodb && data.mongodb.startsWith('connected');
        setServerHealth({
          status: 'online',
          mongoConnected: isMongoOk,
          message: isMongoOk ? 'Express, Mongo & Sockets: Online' : 'Connected (Mongo offline)'
        });
      })
      .catch(() => setServerHealth({ status: 'offline', mongoConnected: false, message: 'Backend Disconnected' }));
  }, []);

  // Notifications fetch
  const fetchNotifications = async () => {
    if (!user) return;
    try {
      const res = await apiFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to load notifications:', err);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, [user]);

  // Real-time socket events for notifications
  useEffect(() => {
    if (!socket) return;

    const handleNewNotif = () => {
      fetchNotifications();
    };

    socket.on('notification:new', handleNewNotif);
    socket.on('collection:completed', handleNewNotif);
    socket.on('complaint:created', handleNewNotif);
    socket.on('route:created', handleNewNotif);

    return () => {
      socket.off('notification:new', handleNewNotif);
      socket.off('collection:completed', handleNewNotif);
      socket.off('complaint:created', handleNewNotif);
      socket.off('route:created', handleNewNotif);
    };
  }, [socket]);

  // Close dropdown on click outside
  useEffect(() => {
    const handleClickOutside = (e) => {
      if (notifDropdownRef.current && !notifDropdownRef.current.contains(e.target)) {
        setIsNotifOpen(false);
      }
    };
    document.addEventListener('mousedown', handleClickOutside);
    return () => document.removeEventListener('mousedown', handleClickOutside);
  }, []);

  const handleMarkAsRead = async (id, e) => {
    e.stopPropagation();
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n)));
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  const handleMarkAllAsRead = async () => {
    try {
      await apiFetch('/api/notifications/read-all', { method: 'PUT' });
      setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
      setUnreadCount(0);
    } catch (err) {
      console.error(err);
    }
  };

  const handleLogout = () => {
    logout();
    navigate('/login');
  };

  const roleColors = {
    admin: 'bg-emerald-100 text-emerald-800 border-emerald-300',
    driver: 'bg-teal-100 text-teal-800 border-teal-300',
    citizen: 'bg-cyan-100 text-cyan-800 border-cyan-300'
  };

  return (
    <header className="h-16 bg-white dark:bg-slate-900 border-b border-slate-200 dark:border-slate-800 px-4 sm:px-6 flex items-center justify-between sticky top-0 z-20 shadow-xs transition-colors">
      {/* Left: Mobile Menu Toggle & Search / Connectivity */}
      <div className="flex items-center gap-3">
        <button
          type="button"
          onClick={onToggleSidebar}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg lg:hidden"
          title="Toggle Navigation Menu"
        >
          <Menu className="h-5 w-5" />
        </button>

        <div className="relative hidden md:block w-56 lg:w-72">
          <Search className="h-4 w-4 absolute left-3 top-1/2 -translate-y-1/2 text-slate-400" />
          <input
            type="text"
            placeholder="Search system..."
            className="w-full pl-9 pr-4 py-1.5 bg-slate-100/80 dark:bg-slate-800 hover:bg-slate-100 dark:hover:bg-slate-750 focus:bg-white dark:focus:bg-slate-900 text-xs text-slate-800 dark:text-slate-200 rounded-lg border border-slate-200 dark:border-slate-700 focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 focus:outline-none transition-all"
          />
        </div>

        {/* Backend Connectivity Status Pill */}
        <div
          className={`hidden xl:flex items-center gap-2 px-3 py-1 rounded-full text-[11px] font-semibold border ${
            serverHealth.status === 'online'
              ? 'bg-emerald-50 dark:bg-emerald-950/50 text-emerald-700 dark:text-emerald-300 border-emerald-200 dark:border-emerald-800'
              : serverHealth.status === 'offline'
              ? 'bg-rose-50 dark:bg-rose-950/50 text-rose-700 dark:text-rose-300 border-rose-200 dark:border-rose-800'
              : 'bg-amber-50 dark:bg-amber-950/50 text-amber-700 dark:text-amber-300 border-amber-200 dark:border-amber-800'
          }`}
        >
          <span className="relative flex h-2 w-2">
            <span
              className={`animate-ping absolute inline-flex h-full w-full rounded-full opacity-75 ${
                serverHealth.status === 'online' ? 'bg-emerald-400' : 'bg-rose-400'
              }`}
            ></span>
            <span
              className={`relative inline-flex rounded-full h-2 w-2 ${
                serverHealth.status === 'online' ? 'bg-emerald-500' : 'bg-rose-500'
              }`}
            ></span>
          </span>
          <span>{serverHealth.message}</span>
        </div>
      </div>

      {/* Right: Theme Toggle, Notifications, User Profile & Logout */}
      <div className="flex items-center gap-2 sm:gap-3">
        {/* Dark Mode Theme Toggle Button */}
        <button
          type="button"
          onClick={toggleTheme}
          className="p-2 text-slate-500 dark:text-slate-400 hover:text-slate-800 dark:hover:text-slate-100 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
          title={isDark ? 'Switch to Light Mode' : 'Switch to Dark Mode'}
        >
          {isDark ? (
            <Sun className="h-5 w-5 text-amber-400 hover:rotate-45 transition-transform" />
          ) : (
            <Moon className="h-5 w-5 text-slate-600 dark:text-slate-300 hover:-rotate-12 transition-transform" />
          )}
        </button>

        {/* Universal Notifications Bell with Dropdown */}
        <div className="relative" ref={notifDropdownRef}>
          <button
            type="button"
            onClick={() => setIsNotifOpen(!isNotifOpen)}
            className="relative p-2 text-slate-500 dark:text-slate-400 hover:text-slate-700 dark:hover:text-slate-200 hover:bg-slate-100 dark:hover:bg-slate-800 rounded-lg transition-colors cursor-pointer"
            title="Notifications"
          >
            <Bell className="h-5 w-5" />
            {unreadCount > 0 && (
              <span className="absolute top-1 right-1 flex items-center justify-center min-w-[18px] h-[18px] px-1 bg-rose-500 text-white font-extrabold text-[10px] rounded-full ring-2 ring-white dark:ring-slate-900 animate-pulse">
                {unreadCount > 9 ? '9+' : unreadCount}
              </span>
            )}
          </button>

          {/* Notifications Dropdown Panel */}
          {isNotifOpen && (
            <div className="absolute right-0 mt-2 w-80 sm:w-96 bg-white dark:bg-slate-900 rounded-2xl shadow-2xl border border-slate-200 dark:border-slate-800 overflow-hidden z-50 animate-in fade-in slide-in-from-top-2 duration-150">
              <div className="p-3.5 bg-slate-900 dark:bg-slate-950 text-white flex items-center justify-between border-b border-slate-800">
                <div className="flex items-center gap-2">
                  <Bell className="h-4 w-4 text-teal-400" />
                  <span className="text-xs font-bold uppercase tracking-wider">
                    Notifications ({unreadCount} unread)
                  </span>
                </div>
                {unreadCount > 0 && (
                  <button
                    type="button"
                    onClick={handleMarkAllAsRead}
                    className="text-[10px] text-teal-300 hover:text-white flex items-center gap-1 font-semibold"
                  >
                    <CheckCheck className="h-3 w-3" /> Mark all read
                  </button>
                )}
              </div>

              <div className="max-h-80 overflow-y-auto divide-y divide-slate-100 dark:divide-slate-800">
                {notifications.length === 0 ? (
                  <div className="p-8 text-center text-xs text-slate-400">
                    <Bell className="h-6 w-6 mx-auto mb-2 opacity-40" />
                    No notifications yet.
                  </div>
                ) : (
                  notifications.slice(0, 10).map((n) => (
                    <div
                      key={n.id}
                      onClick={(e) => !n.is_read && handleMarkAsRead(n.id, e)}
                      className={`p-3 text-xs transition-colors flex items-start gap-3 cursor-pointer ${
                        !n.is_read ? 'bg-teal-50/40 dark:bg-teal-950/30 hover:bg-teal-50/70 dark:hover:bg-teal-950/50 font-medium' : 'hover:bg-slate-50 dark:hover:bg-slate-800/60'
                      }`}
                    >
                      <div
                        className={`h-7 w-7 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                          n.type === 'warning'
                            ? 'bg-amber-100 dark:bg-amber-950/60 text-amber-700 dark:text-amber-400'
                            : n.type === 'urgent'
                            ? 'bg-rose-100 dark:bg-rose-950/60 text-rose-700 dark:text-rose-400'
                            : 'bg-teal-100 dark:bg-teal-950/60 text-teal-700 dark:text-teal-400'
                        }`}
                      >
                        {n.type === 'warning' || n.type === 'urgent' ? (
                          <AlertTriangle className="h-3.5 w-3.5" />
                        ) : (
                          <Info className="h-3.5 w-3.5" />
                        )}
                      </div>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-center justify-between gap-1">
                          <span className="font-bold text-slate-900 dark:text-slate-100 truncate text-[11px]">{n.title}</span>
                          {!n.is_read && <span className="h-2 w-2 rounded-full bg-teal-500 shrink-0"></span>}
                        </div>
                        <p className="text-[11px] text-slate-600 dark:text-slate-300 mt-0.5 line-clamp-2">{n.message}</p>
                        <span className="text-[9px] text-slate-400 dark:text-slate-500 mt-1 flex items-center gap-1 font-mono">
                          <Clock className="h-2.5 w-2.5" />
                          {new Date(n.created_at).toLocaleString()}
                        </span>
                      </div>
                    </div>
                  ))
                )}
              </div>
            </div>
          )}
        </div>

        <div className="h-6 w-px bg-slate-200 dark:bg-slate-800"></div>

        {/* User Profile Info */}
        <div className="flex items-center gap-3">
          <div className="h-9 w-9 rounded-full bg-emerald-100 dark:bg-emerald-950/80 border border-emerald-300 dark:border-emerald-700 text-emerald-800 dark:text-emerald-300 flex items-center justify-center font-bold text-sm">
            {user?.name ? user.name[0].toUpperCase() : <User className="h-5 w-5 text-emerald-700" />}
          </div>
          <div className="hidden sm:block text-left">
            <div className="text-xs font-bold text-slate-800 dark:text-slate-200 flex items-center gap-1.5">
              <span className="truncate max-w-[120px]">{user?.name || 'Guest'}</span>
              <span
                className={`text-[9px] px-2 py-0.5 rounded-full font-semibold border uppercase ${
                  roleColors[user?.role] || 'bg-slate-100 dark:bg-slate-800 text-slate-700 dark:text-slate-300'
                }`}
              >
                {user?.role || 'Guest'}
              </span>
            </div>
            <div className="text-[11px] text-slate-500 dark:text-slate-400 truncate max-w-[140px]">{user?.email}</div>
          </div>
        </div>

        {/* Logout Button */}
        <button
          type="button"
          onClick={handleLogout}
          className="flex items-center gap-1.5 px-3 py-1.5 bg-slate-100 dark:bg-slate-800 hover:bg-rose-50 dark:hover:bg-rose-950/60 hover:text-rose-700 dark:hover:text-rose-400 text-slate-600 dark:text-slate-300 rounded-lg text-xs font-semibold border border-slate-200 dark:border-slate-700 hover:border-rose-200 dark:hover:border-rose-800 transition-all cursor-pointer ml-1"
          title="Sign Out"
        >
          <LogOut className="h-4 w-4" />
          <span className="hidden sm:inline">Logout</span>
        </button>
      </div>
    </header>
  );
}
