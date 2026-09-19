import React, { createContext, useContext, useEffect, useState } from 'react';
import { io } from 'socket.io-client';
import { AlertTriangle, X, Truck } from 'lucide-react';

const SocketContext = createContext(null);

export function SocketProvider({ children }) {
  const [socket, setSocket] = useState(null);
  const [isConnected, setIsConnected] = useState(false);
  const [alerts, setAlerts] = useState([]);

  useEffect(() => {
    // Connect to Socket.IO server on backend port or cloud URL
    const socketUrl = import.meta.env.VITE_SOCKET_URL || import.meta.env.VITE_API_URL || window.location.origin;
    const socketInstance = io(socketUrl, {
      transports: ['websocket', 'polling']
    });

    socketInstance.on('connect', () => {
      console.log('[Socket.IO Client] Connected to real-time server.');
      setIsConnected(true);
    });

    socketInstance.on('disconnect', () => {
      console.log('[Socket.IO Client] Disconnected.');
      setIsConnected(false);
    });

    // Handle Critical Bin Alerts
    socketInstance.on('bin:alert', (data) => {
      const id = Date.now();
      const newAlert = { id, type: 'critical', title: 'IoT Critical Bin Alert', message: data.message, bin: data.bin };
      setAlerts((prev) => [newAlert, ...prev.slice(0, 4)]);

      // Auto-dismiss after 6 seconds
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }, 6000);
    });

    // Handle Live Collection Completed Notification for Admins
    socketInstance.on('collection:completed', (data) => {
      const id = Date.now();
      const newAlert = {
        id,
        type: 'collection',
        title: 'Collection Completed',
        message: data.message,
        driver: data.driver,
        bin: data.bin
      };
      setAlerts((prev) => [newAlert, ...prev.slice(0, 4)]);

      // Auto-dismiss after 7 seconds
      setTimeout(() => {
        setAlerts((prev) => prev.filter((a) => a.id !== id));
      }, 7000);
    });

    setSocket(socketInstance);

    return () => {
      socketInstance.disconnect();
    };
  }, []);

  const dismissAlert = (id) => {
    setAlerts((prev) => prev.filter((a) => a.id !== id));
  };

  return (
    <SocketContext.Provider value={{ socket, isConnected, alerts }}>
      {children}

      {/* Floating Toast Notification Container for Admin Real-Time Alerts */}
      <div className="fixed bottom-5 right-5 z-50 space-y-2 max-w-sm pointer-events-none">
        {alerts.map((alert) => {
          const isCollection = alert.type === 'collection';
          return (
            <div
              key={alert.id}
              className={`pointer-events-auto bg-slate-900 text-white p-4 rounded-2xl shadow-2xl border-l-4 flex items-start gap-3 animate-slide-up transition-all ${
                isCollection ? 'border-emerald-500' : 'border-rose-500'
              }`}
            >
              {isCollection ? (
                <div className="w-6 h-6 rounded-full bg-emerald-500/20 text-emerald-400 flex items-center justify-center shrink-0 mt-0.5">
                  <Truck className="h-3.5 w-3.5 text-emerald-400" />
                </div>
              ) : (
                <AlertTriangle className="h-5 w-5 text-rose-400 shrink-0 mt-0.5 animate-bounce" />
              )}
              <div className="flex-1 text-xs">
                <div className={`font-bold ${isCollection ? 'text-emerald-400' : 'text-rose-300'}`}>
                  {alert.title}
                </div>
                <p className="text-slate-200 mt-0.5 leading-snug">{alert.message}</p>
              </div>
              <button
                onClick={() => dismissAlert(alert.id)}
                className="text-slate-400 hover:text-white p-1 rounded-md"
              >
                <X className="h-4 w-4" />
              </button>
            </div>
          );
        })}
      </div>
    </SocketContext.Provider>
  );
}

export function useSocket() {
  return useContext(SocketContext);
}

