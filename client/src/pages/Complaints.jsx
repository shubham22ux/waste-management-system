import React, { useEffect, useState, useMemo } from 'react';
import { apiFetch } from '../api';
import { useSocket } from '../context/SocketContext';
import AssignDriverModal from '../components/AssignDriverModal';
import {
  MessageSquareWarning,
  Filter,
  Search,
  CheckCircle2,
  Clock,
  Clock3,
  AlertCircle,
  Trash2,
  MapPin,
  ExternalLink,
  Eye,
  X,
  Send,
  Wrench,
  Truck,
  ShieldAlert,
  User,
  Phone,
  Mail,
  Calendar,
  Sparkles,
  AlertTriangle,
  FileText
} from 'lucide-react';

export default function Complaints() {
  const { socket } = useSocket();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);

  // Filters
  const [search, setSearch] = useState('');
  const [statusFilter, setStatusFilter] = useState('all');
  const [typeFilter, setTypeFilter] = useState('all');
  const [dateFilter, setDateFilter] = useState('');

  // Active drawer complaint
  const [selectedComplaint, setSelectedComplaint] = useState(null);
  const [resolutionNoteInput, setResolutionNoteInput] = useState('');
  const [statusSelectInput, setStatusSelectInput] = useState('');
  const [actionLoading, setActionLoading] = useState(false);
  const [toastMessage, setToastMessage] = useState(null);

  // Delete modal state
  const [deletingComplaint, setDeletingComplaint] = useState(null);

  // Photo viewer modal
  const [previewPhoto, setPreviewPhoto] = useState(null);

  // Assign Driver Modal state
  const [isAssignModalOpen, setIsAssignModalOpen] = useState(false);
  const [activeRequestId, setActiveRequestId] = useState(null);

  const fetchComplaints = async () => {
    try {
      setLoading(true);
      let queryParams = new URLSearchParams();
      if (statusFilter !== 'all') queryParams.append('status', statusFilter);
      if (typeFilter !== 'all') queryParams.append('type', typeFilter);
      if (dateFilter) queryParams.append('date', dateFilter);

      const url = `/api/complaints?${queryParams.toString()}`;
      const res = await apiFetch(url);
      if (res.ok) {
        const data = await res.json();
        setComplaints(data);
      }
    } catch (err) {
      console.error('Failed to load complaints', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchComplaints();
  }, [statusFilter, typeFilter, dateFilter]);

  // Real-time socket updates
  useEffect(() => {
    if (!socket) return;

    const handleCreated = (newC) => {
      setComplaints((prev) => [newC, ...prev]);
      showToast(`New complaint #${newC.id} received from ${newC.citizen_name}`);
    };

    const handleUpdated = (updatedC) => {
      setComplaints((prev) =>
        prev.map((c) => (c.id === updatedC.id ? { ...c, ...updatedC } : c))
      );
      if (selectedComplaint?.id === updatedC.id) {
        setSelectedComplaint(updatedC);
        setResolutionNoteInput(updatedC.resolution_note || '');
        setStatusSelectInput(updatedC.status);
      }
    };

    const handleDeleted = ({ id }) => {
      setComplaints((prev) => prev.filter((c) => c.id !== id));
      if (selectedComplaint?.id === id) {
        setSelectedComplaint(null);
      }
    };

    socket.on('complaint:created', handleCreated);
    socket.on('complaint:updated', handleUpdated);
    socket.on('complaint:deleted', handleDeleted);

    return () => {
      socket.off('complaint:created', handleCreated);
      socket.off('complaint:updated', handleUpdated);
      socket.off('complaint:deleted', handleDeleted);
    };
  }, [socket, selectedComplaint]);

  const showToast = (msg) => {
    setToastMessage(msg);
    setTimeout(() => {
      setToastMessage(null);
    }, 4500);
  };

  const openDetailDrawer = (c) => {
    setSelectedComplaint(c);
    setResolutionNoteInput(c.resolution_note || '');
    setStatusSelectInput(c.status);
  };

  const closeDetailDrawer = () => {
    setSelectedComplaint(null);
    setResolutionNoteInput('');
    setStatusSelectInput('');
  };

  // Update Status & Resolution Note
  const handleSaveStatusAndNote = async () => {
    if (!selectedComplaint) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/complaints/${selectedComplaint.id}`, {
        method: 'PUT',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          status: statusSelectInput,
          resolution_note: resolutionNoteInput.trim()
        })
      });

      if (res.ok) {
        const updated = await res.json();
        setSelectedComplaint(updated);
        showToast(`Complaint #${updated.id} status updated to ${updated.status}.`);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to update complaint.');
      }
    } catch (err) {
      console.error('Error updating complaint:', err);
      showToast('Network error while saving changes.');
    } finally {
      setActionLoading(false);
    }
  };

  // One-click create urgent collection request
  const handleCreateUrgentRequest = async () => {
    if (!selectedComplaint?.bin_id) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/complaints/${selectedComplaint.id}/create-request`, {
        method: 'POST'
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Urgent collection request dispatched!');
        setSelectedComplaint(data.complaint);
      } else {
        showToast(data.error || 'Failed to create collection request.');
      }
    } catch (err) {
      console.error('Error creating urgent request:', err);
      showToast('Failed to dispatch urgent collection request.');
    } finally {
      setActionLoading(false);
    }
  };

  // One-click mark bin damaged
  const handleMarkDamaged = async () => {
    if (!selectedComplaint?.bin_id) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/complaints/${selectedComplaint.id}/mark-damaged`, {
        method: 'POST'
      });

      const data = await res.json();
      if (res.ok) {
        showToast(data.message || 'Bin marked as damaged and scheduled for repair.');
        setSelectedComplaint(data.complaint);
      } else {
        showToast(data.error || 'Failed to mark bin as damaged.');
      }
    } catch (err) {
      console.error('Error marking damaged:', err);
      showToast('Failed to update bin status.');
    } finally {
      setActionLoading(false);
    }
  };

  // One-click assign driver (creates/links collection request with source 'complaint' and opens modal)
  const handleAssignDriverClick = async () => {
    if (!selectedComplaint?.bin_id) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/complaints/${selectedComplaint.id}/create-request`, {
        method: 'POST'
      });
      const data = await res.json();
      if (res.ok && data.collectionRequest) {
        setActiveRequestId(data.collectionRequest.id);
        setIsAssignModalOpen(true);
      } else {
        showToast(data.error || 'Failed to initialize collection request.');
      }
    } catch (err) {
      console.error('Error preparing driver assignment:', err);
      showToast('Network error preparing collection task.');
    } finally {
      setActionLoading(false);
    }
  };

  // One-click Mark Resolved & Notify Citizen
  const handleMarkResolvedAndNotify = async () => {
    if (!selectedComplaint) return;
    setActionLoading(true);
    try {
      const res = await apiFetch(`/api/complaints/${selectedComplaint.id}/resolve`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({
          resolution_note: resolutionNoteInput.trim()
        })
      });

      const data = await res.json();
      if (res.ok) {
        setSelectedComplaint(data.complaint);
        setStatusSelectInput('resolved');
        setResolutionNoteInput(data.complaint.resolution_note || '');
        showToast(data.message || 'Complaint resolved and citizen notified!');
        fetchComplaints();
      } else {
        showToast(data.error || 'Failed to resolve complaint.');
      }
    } catch (err) {
      console.error('Error resolving complaint:', err);
      showToast('Network error while resolving complaint.');
    } finally {
      setActionLoading(false);
    }
  };

  // Delete complaint
  const handleDelete = async () => {
    if (!deletingComplaint) return;
    try {
      const res = await apiFetch(`/api/complaints/${deletingComplaint.id}`, {
        method: 'DELETE'
      });
      if (res.ok) {
        showToast(`Complaint #${deletingComplaint.id} has been deleted.`);
        setDeletingComplaint(null);
      } else {
        const err = await res.json();
        showToast(err.error || 'Failed to delete complaint.');
      }
    } catch (err) {
      console.error('Delete error:', err);
      showToast('Network error deleting complaint.');
    }
  };

  // Filtered list based on search text
  const filteredComplaints = useMemo(() => {
    return complaints.filter((c) => {
      const matchSearch =
        c.description.toLowerCase().includes(search.toLowerCase()) ||
        c.citizen_name.toLowerCase().includes(search.toLowerCase()) ||
        c.citizen_email.toLowerCase().includes(search.toLowerCase()) ||
        (c.bin_code && c.bin_code.toLowerCase().includes(search.toLowerCase())) ||
        (c.bin_location && c.bin_location.toLowerCase().includes(search.toLowerCase())) ||
        `#${c.id}`.includes(search);

      return matchSearch;
    });
  }, [complaints, search]);

  const getStatusBadge = (status) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Resolved
          </span>
        );
      case 'collected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-teal-100 text-teal-800 border border-teal-300">
            <CheckCircle2 className="h-3 w-3" /> Bin Collected
          </span>
        );
      case 'assigned':
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock3 className="h-3 w-3" /> Driver Assigned
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-0.5 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertCircle className="h-3 w-3" /> Open
          </span>
        );
    }
  };

  const getTypeBadge = (type) => {
    switch (type) {
      case 'overflowing_bin':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-rose-50 text-rose-700 border border-rose-200">Overflowing Bin</span>;
      case 'damaged_bin':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-amber-50 text-amber-700 border border-amber-200">Damaged Bin</span>;
      case 'missed_collection':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-blue-50 text-blue-700 border border-blue-200">Missed Collection</span>;
      case 'illegal_dumping':
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-purple-50 text-purple-700 border border-purple-200">Illegal Dumping</span>;
      default:
        return <span className="px-2 py-0.5 rounded text-[10px] font-black uppercase bg-slate-100 text-slate-700 border border-slate-200">Other Issue</span>;
    }
  };

  return (
    <div className="space-y-6 pb-12">
      {/* Toast Banner */}
      {toastMessage && (
        <div className="fixed top-4 right-4 z-50 bg-slate-900 text-white px-4 py-3 rounded-xl shadow-xl border border-slate-700 flex items-center gap-3 text-xs font-bold animate-in fade-in slide-in-from-top-2">
          <Sparkles className="h-4 w-4 text-emerald-400" />
          <span>{toastMessage}</span>
          <button onClick={() => setToastMessage(null)} className="ml-2 text-slate-400 hover:text-white">
            <X className="h-4 w-4" />
          </button>
        </div>
      )}

      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="p-2 bg-amber-100 text-amber-700 rounded-xl">
              <MessageSquareWarning className="h-6 w-6" />
            </div>
            Citizen Complaints & Grievances
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Review public feedback, assign drivers, inspect evidence, tag damaged assets, and resolve tickets.
          </p>
        </div>

        {/* Counter KPI pills */}
        <div className="flex items-center gap-2 text-xs font-bold flex-wrap">
          <div className="px-3 py-1.5 rounded-xl bg-rose-50 border border-rose-200 text-rose-700">
            Open: {complaints.filter((c) => c.status === 'open').length}
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-blue-50 border border-blue-200 text-blue-700">
            Assigned: {complaints.filter((c) => c.status === 'assigned' || c.status === 'in_progress').length}
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-teal-50 border border-teal-200 text-teal-700">
            Collected: {complaints.filter((c) => c.status === 'collected').length}
          </div>
          <div className="px-3 py-1.5 rounded-xl bg-emerald-50 border border-emerald-200 text-emerald-700">
            Resolved: {complaints.filter((c) => c.status === 'resolved').length}
          </div>
        </div>
      </div>

      {/* Filters & Search Toolbar */}
      <div className="bg-white rounded-2xl border border-slate-200 p-4 shadow-xs flex flex-col md:flex-row items-stretch md:items-center justify-between gap-3">
        {/* Search */}
        <div className="relative flex-1">
          <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-400" />
          <input
            type="text"
            value={search}
            onChange={(e) => setSearch(e.target.value)}
            placeholder="Search by ticket #, citizen name, email, bin code, or keyword..."
            className="w-full pl-10 pr-4 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs text-slate-800 placeholder:text-slate-400 focus:bg-white focus:border-emerald-500 focus:outline-none"
          />
        </div>

        {/* Dropdown Filters */}
        <div className="flex flex-wrap items-center gap-2">
          {/* Status filter */}
          <select
            value={statusFilter}
            onChange={(e) => setStatusFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">All Statuses</option>
            <option value="open">Open</option>
            <option value="assigned">Driver Assigned</option>
            <option value="collected">Bin Collected</option>
            <option value="resolved">Resolved</option>
          </select>

          {/* Type filter */}
          <select
            value={typeFilter}
            onChange={(e) => setTypeFilter(e.target.value)}
            className="px-3 py-2 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-500 cursor-pointer"
          >
            <option value="all">All Categories</option>
            <option value="overflowing_bin">Bin is Full / Overflowing</option>
            <option value="damaged_bin">Bin is Broken / Damaged</option>
            <option value="missed_collection">Collection Was Missed</option>
            <option value="illegal_dumping">Illegal Dumping</option>
            <option value="other">Other</option>
          </select>

          {/* Date filter */}
          <input
            type="date"
            value={dateFilter}
            onChange={(e) => setDateFilter(e.target.value)}
            className="px-3 py-1.5 bg-slate-50 border border-slate-200 rounded-xl text-xs font-semibold text-slate-700 focus:outline-none focus:border-emerald-500"
            title="Filter by filing date"
          />

          {(statusFilter !== 'all' || typeFilter !== 'all' || dateFilter) && (
            <button
              onClick={() => {
                setStatusFilter('all');
                setTypeFilter('all');
                setDateFilter('');
              }}
              className="px-2.5 py-2 text-xs font-bold text-rose-600 hover:text-rose-700 hover:bg-rose-50 rounded-xl transition-colors"
            >
              Reset
            </button>
          )}
        </div>
      </div>

      {/* Complaints Table */}
      <div className="bg-white rounded-2xl border border-slate-200 shadow-xs overflow-hidden">
        {loading ? (
          <div className="p-12 text-center text-slate-400 text-xs">
            <div className="w-6 h-6 border-2 border-amber-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
            Loading complaints pipeline...
          </div>
        ) : filteredComplaints.length === 0 ? (
          <div className="p-12 text-center text-slate-400 text-xs space-y-2">
            <MessageSquareWarning className="h-8 w-8 text-slate-300 mx-auto" />
            <p className="font-bold text-slate-600">No complaints matching filter criteria</p>
            <p className="text-[11px]">Clear search terms or change filters above to review more records.</p>
          </div>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full text-left text-xs text-slate-600">
              <thead className="bg-slate-50 text-[11px] font-bold text-slate-700 uppercase tracking-wider border-b border-slate-200">
                <tr>
                  <th className="px-5 py-3.5">Ticket</th>
                  <th className="px-5 py-3.5">Category</th>
                  <th className="px-5 py-3.5">Citizen</th>
                  <th className="px-5 py-3.5">Linked Bin</th>
                  <th className="px-5 py-3.5">Photo</th>
                  <th className="px-5 py-3.5">Status</th>
                  <th className="px-5 py-3.5">Date</th>
                  <th className="px-5 py-3.5 text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-100 font-medium">
                {filteredComplaints.map((c) => (
                  <tr
                    key={c.id}
                    className="hover:bg-slate-50/80 transition-colors cursor-pointer"
                    onClick={() => openDetailDrawer(c)}
                  >
                    <td className="px-5 py-3.5 font-mono font-bold text-slate-900">
                      #{c.id}
                    </td>
                    <td className="px-5 py-3.5">
                      {getTypeBadge(c.type)}
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="font-bold text-slate-900">{c.citizen_name}</div>
                      <div className="text-[10px] text-slate-400 truncate max-w-[140px]">{c.citizen_email}</div>
                    </td>
                    <td className="px-5 py-3.5">
                      {c.bin_code ? (
                        <div>
                          <div className="font-bold text-slate-800 flex items-center gap-1">
                            <span className="text-emerald-700">{c.bin_code}</span>
                            {c.current_fill_percent !== null && (
                              <span className={`text-[10px] px-1 rounded font-black ${c.current_fill_percent >= 80 ? 'bg-rose-100 text-rose-800' : 'bg-slate-100 text-slate-700'}`}>
                                {c.current_fill_percent}%
                              </span>
                            )}
                          </div>
                          <div className="text-[10px] text-slate-400 truncate max-w-[150px]">{c.bin_location}</div>
                        </div>
                      ) : (
                        <span className="text-slate-400 italic">General Area</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5" onClick={(e) => e.stopPropagation()}>
                      {c.photo_url ? (
                        <button
                          onClick={() => setPreviewPhoto(c.photo_url)}
                          className="w-10 h-10 rounded-lg overflow-hidden border border-slate-200 hover:border-emerald-500 hover:scale-105 transition-all relative group"
                          title="Click to view photo"
                        >
                          <img src={c.photo_url} alt="Evidence" className="w-full h-full object-cover" />
                        </button>
                      ) : (
                        <span className="text-slate-300 text-[11px]">—</span>
                      )}
                    </td>
                    <td className="px-5 py-3.5">
                      {getStatusBadge(c.status)}
                    </td>
                    <td className="px-5 py-3.5 text-[11px] text-slate-500 whitespace-nowrap">
                      {new Date(c.created_at).toLocaleDateString()}
                    </td>
                    <td className="px-5 py-3.5 text-right whitespace-nowrap" onClick={(e) => e.stopPropagation()}>
                      <div className="flex items-center justify-end gap-2">
                        <button
                          onClick={() => openDetailDrawer(c)}
                          className="px-2.5 py-1 bg-slate-100 hover:bg-slate-200 text-slate-700 rounded-lg text-xs font-bold transition-colors"
                        >
                          Review
                        </button>
                        <button
                          onClick={() => setDeletingComplaint(c)}
                          className="p-1.5 text-slate-400 hover:text-rose-600 hover:bg-rose-50 rounded-lg transition-colors"
                          title="Delete complaint record"
                        >
                          <Trash2 className="h-4 w-4" />
                        </button>
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </div>

      {/* Slide-over Detail Drawer */}
      {selectedComplaint && (
        <div
          className="fixed inset-0 z-50 bg-black/40 backdrop-blur-xs flex justify-end animate-in fade-in duration-150"
          onClick={closeDetailDrawer}
        >
          <div
            className="w-full max-w-xl bg-white h-full shadow-2xl overflow-y-auto flex flex-col justify-between"
            onClick={(e) => e.stopPropagation()}
          >
            {/* Drawer Header */}
            <div>
              <div className="p-5 border-b border-slate-200 flex items-center justify-between bg-slate-50/80">
                <div className="flex items-center gap-2.5">
                  <span className="font-mono text-sm font-black text-slate-900 bg-white px-2 py-0.5 rounded-lg border border-slate-200 shadow-2xs">
                    #{selectedComplaint.id}
                  </span>
                  {getTypeBadge(selectedComplaint.type)}
                  {getStatusBadge(selectedComplaint.status)}
                </div>
                <button
                  onClick={closeDetailDrawer}
                  className="p-1.5 rounded-lg hover:bg-slate-200 text-slate-500 transition-colors"
                >
                  <X className="h-5 w-5" />
                </button>
              </div>

              <div className="p-6 space-y-6">
                {/* Action Banners */}
                <div className="space-y-3">
                  {/* Assign Driver for Full or Missed Bins */}
                  {selectedComplaint.bin_id && (selectedComplaint.type === 'overflowing_bin' || selectedComplaint.type === 'missed_collection' || selectedComplaint.status === 'open') && selectedComplaint.status !== 'collected' && selectedComplaint.status !== 'resolved' && (
                    <div className="p-4 bg-blue-50 border border-blue-200 rounded-2xl flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-extrabold text-blue-950 flex items-center gap-1.5">
                          <Truck className="h-4 w-4 text-blue-600" />
                          Assign Collection Driver
                        </div>
                        <p className="text-[11px] text-blue-800 mt-0.5">
                          Creates a collection request linked to this complaint and opens driver assignment.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleAssignDriverClick}
                        disabled={actionLoading}
                        className="px-4 py-2 bg-blue-600 hover:bg-blue-700 text-white rounded-xl text-xs font-bold shadow-xs whitespace-nowrap shrink-0 transition-all cursor-pointer flex items-center gap-1.5 disabled:opacity-50"
                      >
                        <Truck className="h-3.5 w-3.5" /> Assign Driver
                      </button>
                    </div>
                  )}

                  {/* Mark Bin Damaged (grey marker on map) */}
                  {selectedComplaint.type === 'damaged_bin' && selectedComplaint.bin_id && (
                    <div className="p-4 bg-amber-50 border border-amber-200 rounded-2xl flex items-center justify-between gap-3">
                      <div>
                        <div className="text-xs font-extrabold text-amber-900 flex items-center gap-1.5">
                          <Wrench className="h-4 w-4 text-amber-600" />
                          Equipment Damage Reported
                        </div>
                        <p className="text-[11px] text-amber-700 mt-0.5">
                          Tag bin {selectedComplaint.bin_code} as damaged in inventory so its map marker turns grey.
                        </p>
                      </div>
                      <button
                        type="button"
                        onClick={handleMarkDamaged}
                        disabled={actionLoading || selectedComplaint.bin_status === 'damaged'}
                        className="px-4 py-2 bg-amber-600 hover:bg-amber-700 text-white rounded-xl text-xs font-bold shadow-xs whitespace-nowrap shrink-0 transition-all cursor-pointer disabled:opacity-50 flex items-center gap-1.5"
                      >
                        <Wrench className="h-3.5 w-3.5" /> {selectedComplaint.bin_status === 'damaged' ? 'Marked Damaged (Grey)' : 'Mark Damaged'}
                      </button>
                    </div>
                  )}

                  {/* Bin Collected - Ready to Mark Resolved & Notify Citizen */}
                  {selectedComplaint.status === 'collected' && (
                    <div className="p-4 bg-emerald-50 border border-emerald-300 rounded-2xl space-y-3">
                      <div className="flex items-center gap-2 text-xs font-extrabold text-emerald-950">
                        <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                        Bin Collected — Ready for Final Resolution
                      </div>
                      <p className="text-[11px] text-emerald-800 leading-tight">
                        The driver has marked this bin collected. Add an optional resolution note and officially close this complaint.
                      </p>
                      <div>
                        <label className="block text-[10px] font-bold uppercase tracking-wider text-slate-700 mb-1">
                          Resolution Note for Citizen (Optional)
                        </label>
                        <textarea
                          rows={2}
                          value={resolutionNoteInput}
                          onChange={(e) => setResolutionNoteInput(e.target.value)}
                          placeholder="e.g. Bin cleared, cleaned, and returned to active service..."
                          className="w-full px-3 py-2 bg-white border border-emerald-200 rounded-xl text-xs text-slate-800 focus:border-emerald-500 focus:outline-none"
                        />
                      </div>
                      <button
                        type="button"
                        onClick={handleMarkResolvedAndNotify}
                        disabled={actionLoading}
                        className="w-full py-2.5 bg-emerald-600 hover:bg-emerald-700 text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2 cursor-pointer disabled:opacity-50"
                      >
                        <CheckCircle2 className="h-4 w-4" /> Mark Resolved & Notify Citizen
                      </button>
                    </div>
                  )}
                </div>

                {/* Citizen Info Card */}
                <div className="bg-slate-50 rounded-2xl p-4 border border-slate-200 space-y-2">
                  <div className="text-[10px] font-bold uppercase tracking-wider text-slate-500">Citizen Reporter</div>
                  <div className="flex items-center gap-3">
                    <div className="w-10 h-10 rounded-xl bg-slate-200 text-slate-700 flex items-center justify-center font-bold text-sm">
                      {selectedComplaint.citizen_name.charAt(0)}
                    </div>
                    <div>
                      <div className="text-sm font-black text-slate-900">{selectedComplaint.citizen_name}</div>
                      <div className="flex items-center gap-3 text-xs text-slate-500 mt-0.5">
                        <span className="flex items-center gap-1">
                          <Mail className="h-3.5 w-3.5 text-slate-400" /> {selectedComplaint.citizen_email}
                        </span>
                        {selectedComplaint.citizen_phone && (
                          <span className="flex items-center gap-1">
                            <Phone className="h-3.5 w-3.5 text-slate-400" /> {selectedComplaint.citizen_phone}
                          </span>
                        )}
                      </div>
                    </div>
                  </div>
                </div>

                {/* Description */}
                <div>
                  <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                    Grievance Description
                  </div>
                  <div className="p-4 bg-slate-50 rounded-2xl border border-slate-200 text-xs text-slate-800 leading-relaxed">
                    {selectedComplaint.description}
                  </div>
                </div>

                {/* Linked Bin Details */}
                {selectedComplaint.bin_code && (
                  <div className="p-4 bg-emerald-50/50 rounded-2xl border border-emerald-200 space-y-1.5">
                    <div className="text-[10px] font-bold uppercase tracking-wider text-emerald-800">
                      Associated Public Bin
                    </div>
                    <div className="flex items-center justify-between">
                      <div>
                        <div className="text-sm font-black text-emerald-950">{selectedComplaint.bin_code}</div>
                        <div className="text-xs text-emerald-800">{selectedComplaint.bin_location}</div>
                      </div>
                      <div className="text-right">
                        <div className="text-base font-black text-emerald-900">
                          {selectedComplaint.current_fill_percent}% Full
                        </div>
                        <span className="text-[10px] font-bold uppercase text-emerald-700">
                          Status: {selectedComplaint.bin_status || 'active'}
                        </span>
                      </div>
                    </div>
                  </div>
                )}

                {/* Photo Evidence */}
                {selectedComplaint.photo_url && (
                  <div>
                    <div className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1.5">
                      Attached Photographic Evidence
                    </div>
                    <div
                      onClick={() => setPreviewPhoto(selectedComplaint.photo_url)}
                      className="relative rounded-2xl overflow-hidden border border-slate-200 max-h-56 cursor-pointer group bg-slate-100"
                    >
                      <img
                        src={selectedComplaint.photo_url}
                        alt="Evidence"
                        className="w-full h-52 object-cover group-hover:scale-105 transition-transform"
                      />
                      <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1.5">
                        <Eye className="h-4 w-4" /> Click to Expand
                      </div>
                    </div>
                  </div>
                )}

                {/* Status Update & Resolution Note Editor */}
                <div className="bg-slate-50 rounded-2xl border border-slate-200 p-5 space-y-4">
                  <div className="text-xs font-bold text-slate-900 uppercase tracking-wider flex items-center gap-2">
                    <CheckCircle2 className="h-4 w-4 text-emerald-600" />
                    Admin Resolution Panel
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Update Ticket Status
                    </label>
                    <select
                      value={statusSelectInput}
                      onChange={(e) => setStatusSelectInput(e.target.value)}
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs font-bold text-slate-800 focus:border-emerald-500 focus:outline-none"
                    >
                      <option value="open">Open (Under Review)</option>
                      <option value="assigned">Driver Assigned</option>
                      <option value="collected">Bin Collected</option>
                      <option value="resolved">Resolved (Complete)</option>
                    </select>
                  </div>

                  <div>
                    <label className="block text-[11px] font-bold text-slate-700 uppercase mb-1">
                      Resolution Note / Public Response to Citizen
                    </label>
                    <textarea
                      rows={3}
                      value={resolutionNoteInput}
                      onChange={(e) => setResolutionNoteInput(e.target.value)}
                      placeholder="e.g. Sanitation crew dispatched on route #3; bin emptied and surrounding sidewalk cleared..."
                      className="w-full px-3 py-2 bg-white border border-slate-300 rounded-xl text-xs text-slate-800 focus:border-emerald-500 focus:outline-none leading-relaxed"
                    />
                    <p className="text-[10px] text-slate-400 mt-1">
                      This note is immediately pushed to the citizen's portal and notification bell.
                    </p>
                  </div>

                  <button
                    onClick={handleSaveStatusAndNote}
                    disabled={actionLoading}
                    className="w-full py-2.5 bg-slate-900 hover:bg-slate-800 active:bg-black text-white rounded-xl text-xs font-bold shadow-xs transition-colors flex items-center justify-center gap-2 disabled:opacity-50"
                  >
                    {actionLoading ? (
                      <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                    ) : (
                      <>
                        <Send className="h-3.5 w-3.5" /> Save Status & Notify Citizen
                      </>
                    )}
                  </button>
                </div>
              </div>
            </div>

            {/* Drawer Footer */}
            <div className="p-4 border-t border-slate-200 bg-slate-50 flex items-center justify-between text-xs text-slate-500">
              <span>Submitted: {new Date(selectedComplaint.created_at).toLocaleString()}</span>
              <button
                onClick={closeDetailDrawer}
                className="px-3.5 py-1.5 bg-white border border-slate-200 text-slate-700 font-bold rounded-lg hover:bg-slate-100"
              >
                Close
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      {deletingComplaint && (
        <div className="fixed inset-0 z-50 bg-black/50 backdrop-blur-xs flex items-center justify-center p-4">
          <div className="bg-white rounded-2xl max-w-sm w-full p-6 shadow-2xl border border-slate-200 space-y-4 animate-in zoom-in-95 duration-150">
            <div className="w-12 h-12 rounded-full bg-rose-100 text-rose-600 flex items-center justify-center mx-auto">
              <AlertTriangle className="h-6 w-6" />
            </div>
            <div className="text-center">
              <h4 className="text-base font-black text-slate-900">Delete Complaint #{deletingComplaint.id}?</h4>
              <p className="text-xs text-slate-500 mt-1">
                Are you sure you want to remove this report filed by {deletingComplaint.citizen_name}? This action cannot be undone.
              </p>
            </div>
            <div className="flex items-center gap-2 pt-2">
              <button
                onClick={() => setDeletingComplaint(null)}
                className="flex-1 py-2.5 border border-slate-300 text-slate-700 font-bold text-xs rounded-xl hover:bg-slate-50"
              >
                Cancel
              </button>
              <button
                onClick={handleDelete}
                className="flex-1 py-2.5 bg-rose-600 hover:bg-rose-700 text-white font-bold text-xs rounded-xl shadow-xs"
              >
                Confirm Delete
              </button>
            </div>
          </div>
        </div>
      )}

      {/* Lightbox Modal for Photo */}
      {previewPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4"
          onClick={() => setPreviewPhoto(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setPreviewPhoto(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white z-10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={previewPhoto}
              alt="Full size evidence"
              className="w-full h-auto max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}

      {/* Assign Driver Modal */}
      {selectedComplaint && selectedComplaint.bin_id && (
        <AssignDriverModal
          isOpen={isAssignModalOpen}
          onClose={() => {
            setIsAssignModalOpen(false);
            setActiveRequestId(null);
          }}
          bin={{
            id: selectedComplaint.bin_id,
            bin_code: selectedComplaint.bin_code,
            location_name: selectedComplaint.bin_location,
            current_fill_percent: selectedComplaint.current_fill_percent,
            latitude: selectedComplaint.latitude,
            longitude: selectedComplaint.longitude,
            complaint_photo: selectedComplaint.photo_url
          }}
          requestId={activeRequestId}
          complaint={selectedComplaint}
          onAssigned={() => {
            fetchComplaints();
            showToast('Driver successfully assigned to collection task!');
          }}
        />
      )}
    </div>
  );
}
