import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { useSocket } from '../../context/SocketContext';
import { Bell, CheckCircle, Info, AlertTriangle, CheckCheck, Clock } from 'lucide-react';

export default function DriverNotifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);
  const { socket } = useSocket();

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/notifications');
      if (res.ok) {
        const data = await res.json();
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch (err) {
      console.error('Failed to fetch notifications:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchNotifications();
  }, []);

  useEffect(() => {
    if (!socket) return;
    const handleNewNotification = () => {
      fetchNotifications();
    };

    socket.on('notification:new', handleNewNotification);
    return () => {
      socket.off('notification:new', handleNewNotification);
    };
  }, [socket]);

  const markAllAsRead = async () => {
    try {
      const res = await apiFetch('/api/notifications/read-all', { method: 'PUT' });
      if (res.ok) {
        setNotifications((prev) => prev.map((n) => ({ ...n, is_read: 1 })));
        setUnreadCount(0);
      }
    } catch (err) {
      console.error('Failed to mark all as read:', err);
    }
  };

  const markAsRead = async (id) => {
    try {
      await apiFetch(`/api/notifications/${id}/read`, { method: 'PUT' });
      setNotifications((prev) =>
        prev.map((n) => (n.id === id ? { ...n, is_read: 1 } : n))
      );
      setUnreadCount((prev) => Math.max(0, prev - 1));
    } catch (err) {
      console.error(err);
    }
  };

  return (
    <div className="space-y-5 max-w-xl mx-auto md:max-w-4xl w-full px-3 sm:px-4 pb-12 overflow-x-hidden">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
        <div>
          <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
            <Bell className="h-5 w-5 sm:h-6 sm:w-6 text-teal-600 shrink-0" />
            Driver Notifications
          </h2>
          <p className="text-xs text-slate-500 mt-0.5">
            Real-time route assignments, urgent bin alerts, and collection notices.
          </p>
        </div>

        {unreadCount > 0 && (
          <button
            type="button"
            onClick={markAllAsRead}
            className="w-full sm:w-auto inline-flex items-center justify-center gap-1.5 px-4 py-2.5 rounded-xl bg-teal-50 hover:bg-teal-100 text-teal-700 text-xs sm:text-sm font-bold min-h-[44px] transition-colors active:scale-95"
          >
            <CheckCheck className="h-4 w-4" />
            Mark all as read
          </button>
        )}
      </div>

      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs p-5 space-y-3">
        {loading ? (
          <div className="py-8 text-center text-xs text-slate-400">
            <div className="w-5 h-5 border-2 border-teal-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Loading dispatch notifications...
          </div>
        ) : notifications.length === 0 ? (
          <div className="py-10 text-center space-y-2">
            <Bell className="h-8 w-8 text-slate-300 mx-auto" />
            <div className="text-xs font-semibold text-slate-700">No notifications yet</div>
            <p className="text-[11px] text-slate-400">
              When a new collection route is assigned, notifications will appear here.
            </p>
          </div>
        ) : (
          <div className="divide-y divide-slate-100">
            {notifications.map((n) => (
              <div
                key={n.id}
                onClick={() => !n.is_read && markAsRead(n.id)}
                className={`py-3.5 px-3 rounded-xl transition-colors cursor-pointer flex items-start justify-between gap-3 ${
                  !n.is_read ? 'bg-teal-50/50 hover:bg-teal-50/80 font-medium' : 'hover:bg-slate-50'
                }`}
              >
                <div className="flex items-start gap-3">
                  <div
                    className={`h-8 w-8 rounded-lg flex items-center justify-center shrink-0 mt-0.5 ${
                      n.type === 'warning'
                        ? 'bg-amber-100 text-amber-700'
                        : n.type === 'urgent'
                        ? 'bg-rose-100 text-rose-700'
                        : 'bg-teal-100 text-teal-700'
                    }`}
                  >
                    {n.type === 'warning' ? (
                      <AlertTriangle className="h-4 w-4" />
                    ) : (
                      <Info className="h-4 w-4" />
                    )}
                  </div>

                  <div>
                    <div className="flex items-center gap-2">
                      <span className="text-xs font-bold text-slate-900">{n.title}</span>
                      {!n.is_read && (
                        <span className="h-2 w-2 rounded-full bg-teal-500"></span>
                      )}
                    </div>
                    <p className="text-xs text-slate-600 mt-0.5">{n.message}</p>
                    <span className="text-[10px] text-slate-400 mt-1 flex items-center gap-1">
                      <Clock className="h-3 w-3" />
                      {new Date(n.created_at).toLocaleString()}
                    </span>
                  </div>
                </div>

                {!n.is_read && (
                  <span className="text-[10px] font-bold text-teal-600 bg-teal-100/60 px-2 py-0.5 rounded">
                    New
                  </span>
                )}
              </div>
            ))}
          </div>
        )}
      </div>
    </div>
  );
}
