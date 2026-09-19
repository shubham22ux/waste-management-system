import React from 'react';
import { BrowserRouter as Router, Routes, Route, Navigate } from 'react-router-dom';
import { AuthProvider, useAuth } from './context/AuthContext';
import { ThemeProvider } from './context/ThemeContext';
import { SocketProvider } from './context/SocketContext';
import Layout from './components/Layout';
import Landing from './pages/Landing';
import Login from './pages/Login';
import Register from './pages/Register';

// Admin Pages
import Dashboard from './pages/Dashboard';
import Bins from './pages/Bins';
import RoutesPage from './pages/Routes';
import Drivers from './pages/Drivers';
import Vehicles from './pages/Vehicles';
import FuelAnalytics from './pages/FuelAnalytics';
import OperationsAnalytics from './pages/OperationsAnalytics';
import Complaints from './pages/Complaints';

// Driver Pages
import DriverRoutes from './pages/driver/DriverRoutes';
import DriverProfile from './pages/driver/DriverProfile';
import DriverNotifications from './pages/driver/DriverNotifications';

// Citizen Pages
import ReportComplaint from './pages/citizen/ReportComplaint';
import MyComplaints from './pages/citizen/MyComplaints';
import NearbyBins from './pages/citizen/NearbyBins';

function ProtectedLayout({ allowedRoles }) {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-900 flex items-center justify-center text-teal-400">
        <div className="flex items-center gap-3 font-semibold text-sm">
          <div className="w-5 h-5 border-2 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
          Authenticating session...
        </div>
      </div>
    );
  }

  if (!user) {
    return <Navigate to="/login" replace />;
  }

  if (allowedRoles && !allowedRoles.includes(user.role)) {
    if (user.role === 'driver') return <Navigate to="/driver/routes" replace />;
    if (user.role === 'citizen') return <Navigate to="/citizen/bins" replace />;
    return <Navigate to="/" replace />;
  }

  return <Layout />;
}

function RootRoute() {
  const { user, loading } = useAuth();

  if (loading) {
    return (
      <div className="min-h-screen bg-slate-950 flex items-center justify-center text-teal-400">
        <div className="w-6 h-6 border-2 border-teal-400 border-t-transparent rounded-full animate-spin"></div>
      </div>
    );
  }

  if (!user) {
    return <Landing />;
  }

  if (user.role === 'driver') return <Navigate to="/driver/routes" replace />;
  if (user.role === 'citizen') return <Navigate to="/citizen/bins" replace />;

  return <Layout />;
}

export default function App() {
  return (
    <ThemeProvider>
      <AuthProvider>
        <SocketProvider>
          <Router>
            <Routes>
              {/* Public Landing & Auth Routes */}
              <Route path="/landing" element={<Landing />} />
              <Route path="/login" element={<Login />} />
              <Route path="/register" element={<Register />} />

              {/* Root Route: Shows Landing if logged out, or Admin Layout if admin */}
              <Route element={<RootRoute />}>
                <Route path="/" element={<Dashboard />} />
              </Route>

              {/* Admin Protected Routes */}
              <Route element={<ProtectedLayout allowedRoles={['admin']} />}>
                <Route path="/dashboard" element={<Dashboard />} />
                <Route path="/bins" element={<Bins />} />
                <Route path="/routes" element={<RoutesPage />} />
                <Route path="/drivers" element={<Drivers />} />
                <Route path="/vehicles" element={<Vehicles />} />
                <Route path="/fuel-analytics" element={<FuelAnalytics />} />
                <Route path="/operations-analytics" element={<OperationsAnalytics />} />
                <Route path="/analytics" element={<OperationsAnalytics />} />
                <Route path="/complaints" element={<Complaints />} />
              </Route>

              {/* Driver Protected Routes */}
              <Route element={<ProtectedLayout allowedRoles={['driver']} />}>
                <Route path="/driver/routes" element={<DriverRoutes />} />
                <Route path="/driver/profile" element={<DriverProfile />} />
                <Route path="/driver/notifications" element={<DriverNotifications />} />
              </Route>

              {/* Citizen Protected Routes */}
              <Route element={<ProtectedLayout allowedRoles={['citizen']} />}>
                <Route path="/citizen/report" element={<ReportComplaint />} />
                <Route path="/citizen/complaints" element={<MyComplaints />} />
                <Route path="/citizen/bins" element={<NearbyBins />} />
              </Route>

              {/* Fallback */}
              <Route path="*" element={<Navigate to="/" replace />} />
            </Routes>
          </Router>
        </SocketProvider>
      </AuthProvider>
    </ThemeProvider>
  );
}
