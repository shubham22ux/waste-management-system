import React, { useEffect, useState } from 'react';
import { apiFetch } from '../api';
import { useSocket } from '../context/SocketContext';
import AssignDriverModal from './AssignDriverModal';
import {
  Route,
  AlertCircle,
  Plus,
  XCircle,
  CheckCircle,
  Clock,
  Trash2,
  X,
  Filter,
  Truck,
  Radio,
  FileText,
  UserCheck
} from 'lucide-react';

export default function CollectionRequestsTable({ limit }) {
  const [requests, setRequests] = useState([]);
  const [bins, setBins] = useState([]);
  const [loading, setLoading] = useState(true);
  const [statusFilter, setStatusFilter] = useState('all');
  const [isManualModalOpen, setIsManualModalOpen] = useState(false);
  const [selectedBinId, setSelectedBinId] = useState('');
  const [selectedPriority, setSelectedPriority] = useState('normal');

  // State for reusable AssignDriverModal
  const [assignModal, setAssignModal] = useState({
    isOpen: false,
    bin: null,
    requestId: null,
    complaint: null
  });

  const { socket } = useSocket();

  const fetchRequests = async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/requests');
      if (res.ok) {
        const data = await res.json();
        setRequests(data);
      }
    } catch (err) {
      console.error('Failed to fetch collection requests', err);
    } finally {
      setLoading(false);
    }
  };

  const fetchAvailableBins = async () => {
    try {
      const res = await apiFetch('/api/bins');
      if (res.ok) {
        const data = await res.json();
        setBins(data);
        if (data.length > 0) setSelectedBinId(data[0].id);
      }
    } catch (err) {
      console.error('Failed to fetch bins', err);
    }
  };

  useEffect(() => {
    fetchRequests();
    fetchAvailableBins();
  }, []);

  // WebSockets real-time listeners
  useEffect(() => {
    if (!socket) return;

    const handleCreated = (newReq) => {
      setRequests((prev) => {
        const exists = prev.some((r) => r.id === newReq.id);
        if (exists) return prev;
        return [newReq, ...prev];
      });
    };

    const handleUpdated = (updatedReq) => {
      setRequests((prev) => prev.map((r) => (r.id === updatedReq.id ? updatedReq : r)));
    };

    const handleDeleted = ({ id }) => {
      setRequests((prev) => prev.filter((r) => r.id !== id));
    };

    const handleRefreshAll = () => {
      fetchRequests();
    };

    socket.on('request:created', handleCreated);
    socket.on('request:updated', handleUpdated);
    socket.on('requests:updated', handleRefreshAll);
    socket.on('request:deleted', handleDeleted);

    return () => {
      socket.off('request:created', handleCreated);
      socket.off('request:updated', handleUpdated);
      socket.off('requests:updated', handleRefreshAll);
      socket.off('request:deleted', handleDeleted);
    };
  }, [socket]);

  const handleCancelRequest = async (id) => {
    if (!window.confirm('Are you sure you want to cancel this collection request?')) return;
    try {
      const res = await apiFetch(`/api/requests/${id}`, { method: 'DELETE' });
      if (res.ok) fetchRequests();
    } catch (err) {
      alert('Error cancelling request: ' + err.message);
    }
  };

  const handleCompleteRequest = async (id) => {
    try {
      const res = await apiFetch(`/api/requests/${id}`, {
        method: 'PUT',
        body: JSON.stringify({ status: 'completed' })
      });
      if (res.ok) fetchRequests();
    } catch (err) {
      alert('Error completing request: ' + err.message);
    }
  };

  const handleCreateManualRequest = async (e) => {
    e.preventDefault();
    if (!selectedBinId) return;
    try {
      const res = await apiFetch('/api/requests', {
        method: 'POST',
        body: JSON.stringify({
          bin_id: Number(selectedBinId),
          priority: selectedPriority,
          status: 'pending',
          source: 'manual'
        })
      });
      if (res.ok) {
        setIsManualModalOpen(false);
        fetchRequests();
      }
    } catch (err) {
      alert('Error creating request: ' + err.message);
    }
  };

  const openAssignModal = (req) => {
    setAssignModal({
      isOpen: true,
      bin: {
        id: req.bin_id,
        bin_code: req.bin_code,
        location_name: req.location_name,
        current_fill_percent: req.current_fill_percent,
        latitude: req.latitude,
        longitude: req.longitude,
        complaint_photo: req.complaint_photo
      },
      requestId: req.id,
      complaint: req.complaint_id ? { id: req.complaint_id, photo_url: req.complaint_photo } : null
    });
  };

  const filteredRequests = requests.filter((r) => {
    if (statusFilter === 'all') return true;
    if (statusFilter === 'unassigned') return r.status === 'pending' || !r.assigned_driver_id;
    return r.status === statusFilter;
  });

  const displayedRequests = limit ? filteredRequests.slice(0, limit) : filteredRequests;

  const priorityBadges = {
    urgent: 'bg-rose-100 text-rose-800 border-rose-300 animate-pulse font-extrabold',
    high: 'bg-amber-100 text-amber-800 border-amber-300 font-bold',
    normal: 'bg-blue-100 text-blue-800 border-blue-300 font-medium'
  };

  const statusBadges = {
    pending: 'bg-amber-50 text-amber-700 border-amber-200',
    assigned: 'bg-blue-50 text-blue-700 border-blue-200',
    in_progress: 'bg-indigo-50 text-indigo-700 border-indigo-200',
    completed: 'bg-emerald-50 text-emerald-700 border-emerald-200',
    cancelled: 'bg-slate-100 text-slate-600 border-slate-200'
  };

  const renderSourceBadge = (source) => {
    switch (source) {
      case 'sensor':
        return (
          <span className="inline-flex items-center gap-1 bg-cyan-50 text-cyan-700 border border-cyan-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
            <Radio className="w-2.5 h-2.5 text-cyan-600" />
            Sensor
          </span>
        );
      case 'complaint':
        return (
          <span className="inline-flex items-center gap-1 bg-purple-50 text-purple-700 border border-purple-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
            <AlertCircle className="w-2.5 h-2.5 text-purple-600" />
            Complaint
          </span>
        );
      case 'manual':
      default:
        return (
          <span className="inline-flex items-center gap-1 bg-slate-100 text-slate-700 border border-slate-200 px-2 py-0.5 rounded-full text-[10px] font-bold">
            <FileText className="w-2.5 h-2.5 text-slate-500" />
            Manual
          </span>
        );
    }
  };

  return (
    <div className="bg-white rounded-2xl border border-slate-200 overflow-hidden shadow-xs space-y-4 p-5">
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b pb-4">
        <div>
          <h3 className="text-base font-bold text-slate-900 flex items-center gap-2">
            <Route className="h-5 w-5 text-teal-600" />
            Collection Requests Queue
          </h3>
          <p className="text-xs text-slate-500 mt-0.5">
            Pending & assigned tasks sorted by priority (urgent &gt; high &gt; normal) then oldest first.
          </p>
        </div>

        <div className="flex items-center gap-2">
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-700 outline-none"
          >
            <option value="all">All Requests</option>
            <option value="unassigned">Pending (Unassigned)</option>
            <option value="pending">Pending</option>
            <option value="assigned">Assigned</option>
            <option value="in_progress">In Progress</option>
            <option value="completed">Completed</option>
          </select>

          <button
            type="button"
            onClick={() => setIsManualModalOpen(true)}
            className="inline-flex items-center gap-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold px-3 py-1.5 rounded-xl transition-all shadow-xs"
          >
            <Plus className="h-4 w-4" /> New Request
          </button>
        </div>
      </div>

      {/* Requests Queue Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-left text-xs text-slate-600">
          <thead className="bg-slate-50 text-slate-700 font-bold uppercase border-b border-slate-200">
            <tr>
              <th className="px-4 py-3">Bin Code</th>
              <th className="px-4 py-3">Location</th>
              <th className="px-4 py-3">Fill %</th>
              <th className="px-4 py-3">Source</th>
              <th className="px-4 py-3">Priority</th>
              <th className="px-4 py-3">Status</th>
              <th className="px-4 py-3">Assigned Driver</th>
              <th className="px-4 py-3">Created</th>
              <th className="px-4 py-3 text-right">Actions</th>
            </tr>
          </thead>
          <tbody className="divide-y divide-slate-100">
            {loading ? (
              <tr>
                <td colSpan="9" className="text-center py-6 text-slate-400">
                  Loading requests queue...
                </td>
              </tr>
            ) : displayedRequests.length === 0 ? (
              <tr>
                <td colSpan="9" className="text-center py-6 text-slate-400">
                  No collection requests matching filter.
                </td>
              </tr>
            ) : (
              displayedRequests.map((req) => (
                <tr key={req.id} className="hover:bg-slate-50/80 transition-colors">
                  <td className="px-4 py-3 font-bold text-slate-900">{req.bin_code}</td>
                  <td className="px-4 py-3 font-medium text-slate-800">{req.location_name}</td>
                  <td className="px-4 py-3 font-bold">
                    <span
                      className={
                        req.current_fill_percent >= 80
                          ? 'text-rose-600'
                          : req.current_fill_percent >= 50
                          ? 'text-amber-600'
                          : 'text-emerald-600'
                      }
                    >
                      {req.current_fill_percent}%
                    </span>
                  </td>
                  <td className="px-4 py-3">{renderSourceBadge(req.source)}</td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] uppercase border ${
                        priorityBadges[req.priority] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {req.priority}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <span
                      className={`px-2.5 py-0.5 rounded-full text-[10px] font-bold uppercase border ${
                        statusBadges[req.status] || 'bg-slate-100 text-slate-700'
                      }`}
                    >
                      {req.status}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    {req.driver_name ? (
                      <div className="flex flex-col">
                        <span className="font-bold text-slate-900 flex items-center gap-1">
                          <UserCheck className="w-3 h-3 text-blue-600" />
                          {req.driver_name}
                        </span>
                        {req.driver_vehicle_plate && (
                          <span className="text-[10px] text-slate-500 font-mono">
                            {req.driver_vehicle_plate}
                          </span>
                        )}
                      </div>
                    ) : (
                      <span className="text-slate-400 italic text-[11px]">Unassigned</span>
                    )}
                  </td>
                  <td className="px-4 py-3 text-slate-400 text-[11px]">
                    {req.created_at
                      ? new Date(req.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })
                      : 'Just now'}
                  </td>
                  <td className="px-4 py-3 text-right space-x-1 whitespace-nowrap">
                    {/* If request is pending / unassigned, show "Assign Driver" button */}
                    {(req.status === 'pending' || !req.assigned_driver_id) && req.status !== 'completed' && req.status !== 'cancelled' ? (
                      <button
                        type="button"
                        onClick={() => openAssignModal(req)}
                        className="inline-flex items-center gap-1.5 bg-blue-600 hover:bg-blue-700 text-white text-[11px] font-bold px-2.5 py-1.5 rounded-xl transition-all shadow-xs"
                        title="Assign Driver"
                      >
                        <Truck className="w-3.5 h-3.5" />
                        Assign Driver
                      </button>
                    ) : null}

                    {req.status !== 'completed' && req.status !== 'cancelled' && (
                      <>
                        <button
                          type="button"
                          onClick={() => handleCompleteRequest(req.id)}
                          className="p-1.5 text-emerald-600 hover:bg-emerald-50 rounded-lg transition-colors inline-block"
                          title="Mark Completed (Reset Bin to 5%)"
                        >
                          <CheckCircle className="h-4 w-4" />
                        </button>
                        <button
                          type="button"
                          onClick={() => handleCancelRequest(req.id)}
                          className="p-1.5 text-rose-500 hover:bg-rose-50 rounded-lg transition-colors inline-block"
                          title="Cancel Request"
                        >
                          <XCircle className="h-4 w-4" />
                        </button>
                      </>
                    )}
                  </td>
                </tr>
              ))
            )}
          </tbody>
        </table>
      </div>

      {/* Reusable Assign Driver Modal */}
      <AssignDriverModal
        isOpen={assignModal.isOpen}
        onClose={() => setAssignModal((prev) => ({ ...prev, isOpen: false }))}
        bin={assignModal.bin}
        requestId={assignModal.requestId}
        complaint={assignModal.complaint}
        onAssigned={() => {
          fetchRequests();
        }}
      />

      {/* Manual Request Creation Modal */}
      {isManualModalOpen && (
        <div className="fixed inset-0 bg-slate-900/60 backdrop-blur-xs flex items-center justify-center p-4 z-50">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl space-y-4">
            <div className="flex items-center justify-between border-b pb-3">
              <h3 className="text-base font-bold text-slate-900">Create Collection Request</h3>
              <button onClick={() => setIsManualModalOpen(false)} className="text-slate-400 hover:text-slate-600">
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleCreateManualRequest} className="space-y-3 text-xs">
              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Select Bin</label>
                <select
                  value={selectedBinId}
                  onChange={(e) => setSelectedBinId(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 outline-none"
                  required
                >
                  {bins.map((b) => (
                    <option key={b.id} value={b.id}>
                      {b.bin_code} - {b.location_name} ({b.current_fill_percent}%)
                    </option>
                  ))}
                </select>
              </div>

              <div>
                <label className="block font-semibold text-slate-700 uppercase mb-1">Priority</label>
                <select
                  value={selectedPriority}
                  onChange={(e) => setSelectedPriority(e.target.value)}
                  className="w-full px-3 py-2 border rounded-xl bg-slate-50 outline-none"
                >
                  <option value="normal">Normal</option>
                  <option value="high">High</option>
                  <option value="urgent">Urgent</option>
                </select>
              </div>

              <div className="flex justify-end gap-2 pt-2">
                <button
                  type="button"
                  onClick={() => setIsManualModalOpen(false)}
                  className="px-4 py-2 border rounded-xl text-slate-600 hover:bg-slate-50"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-4 py-2 bg-emerald-600 text-white rounded-xl hover:bg-emerald-700 font-bold"
                >
                  Create Request
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
