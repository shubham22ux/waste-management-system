import React, { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { useSocket } from '../../context/SocketContext';
import { apiFetch } from '../../api';
import {
  FileText,
  Clock,
  CheckCircle2,
  AlertCircle,
  Clock3,
  Plus,
  Trash2,
  MapPin,
  ExternalLink,
  MessageSquareWarning,
  Eye,
  X,
  Filter
} from 'lucide-react';

export default function MyComplaints() {
  const { user } = useAuth();
  const { socket } = useSocket();

  const [complaints, setComplaints] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filterStatus, setFilterStatus] = useState('all');
  const [selectedPhoto, setSelectedPhoto] = useState(null);

  const fetchMyComplaints = async () => {
    if (!user?.id) return;
    try {
      setLoading(true);
      const res = await apiFetch(`/api/complaints?citizen_id=${user.id}`);
      if (res.ok) {
        const data = await res.json();
        setComplaints(data);
      }
    } catch (err) {
      console.error('Failed to load my complaints:', err);
    } finally {
      setLoading(false);
    }
  };

  useEffect(() => {
    fetchMyComplaints();
  }, [user]);

  // Real-time socket updates for live complaint tracking
  useEffect(() => {
    if (!socket) return;

    const handleUpdate = (updated) => {
      setComplaints((prev) =>
        prev.map((c) => (c.id === updated.id ? { ...c, ...updated } : c))
      );
    };

    const handleCreated = (newC) => {
      if (newC.citizen_id === user?.id) {
        setComplaints((prev) => [newC, ...prev]);
      }
    };

    socket.on('complaint:updated', handleUpdate);
    socket.on('complaint:created', handleCreated);

    return () => {
      socket.off('complaint:updated', handleUpdate);
      socket.off('complaint:created', handleCreated);
    };
  }, [socket, user]);

  const filtered = complaints.filter((c) => {
    if (filterStatus === 'all') return true;
    return c.status === filterStatus;
  });

  const getStatusBadge = (status) => {
    switch (status) {
      case 'resolved':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-emerald-100 text-emerald-800 border border-emerald-300">
            <CheckCircle2 className="h-3 w-3" /> Resolved
          </span>
        );
      case 'collected':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-teal-100 text-teal-800 border border-teal-300">
            <CheckCircle2 className="h-3 w-3" /> Bin Collected
          </span>
        );
      case 'assigned':
      case 'in_progress':
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-blue-100 text-blue-800 border border-blue-300">
            <Clock3 className="h-3 w-3" /> Driver Assigned
          </span>
        );
      default:
        return (
          <span className="inline-flex items-center gap-1 px-2.5 py-1 rounded-full text-[11px] font-extrabold bg-rose-100 text-rose-800 border border-rose-300">
            <AlertCircle className="h-3 w-3" /> Submitted / Open
          </span>
        );
    }
  };

  const getTypeBadge = (type) => {
    const formatted = type?.replace('_', ' ').toUpperCase();
    return (
      <span className="text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded bg-slate-100 text-slate-700">
        {formatted}
      </span>
    );
  };

  return (
    <div className="space-y-6 max-w-4xl mx-auto pb-12">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="p-2 bg-teal-100 text-teal-700 rounded-xl">
              <FileText className="h-6 w-6" />
            </div>
            My Submitted Complaints
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Real-time status tracking through all 4 resolution stages with municipal dispatch updates.
          </p>
        </div>

        <Link
          to="/citizen/report"
          className="inline-flex items-center gap-2 px-4 py-2.5 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white text-xs font-bold rounded-xl shadow-xs transition-colors self-start sm:self-auto"
        >
          <Plus className="h-4 w-4" /> New Complaint
        </Link>
      </div>

      {/* Filter Tabs */}
      <div className="flex items-center gap-2 overflow-x-auto pb-1 text-xs">
        {[
          { id: 'all', label: 'All Reports', count: complaints.length },
          { id: 'open', label: 'Open', count: complaints.filter((c) => c.status === 'open').length },
          { id: 'assigned', label: 'Driver Assigned', count: complaints.filter((c) => c.status === 'assigned' || c.status === 'in_progress').length },
          { id: 'collected', label: 'Bin Collected', count: complaints.filter((c) => c.status === 'collected').length },
          { id: 'resolved', label: 'Resolved', count: complaints.filter((c) => c.status === 'resolved').length }
        ].map((tab) => (
          <button
            key={tab.id}
            onClick={() => setFilterStatus(tab.id)}
            className={`px-3 py-1.5 rounded-lg font-bold transition-colors whitespace-nowrap flex items-center gap-1.5 cursor-pointer ${
              filterStatus === tab.id
                ? 'bg-slate-900 text-white shadow-xs'
                : 'bg-white border border-slate-200 text-slate-600 hover:bg-slate-50'
            }`}
          >
            <span>{tab.label}</span>
            <span className={`px-1.5 py-0.2 rounded text-[10px] ${filterStatus === tab.id ? 'bg-slate-700 text-slate-200' : 'bg-slate-100 text-slate-600'}`}>
              {tab.count}
            </span>
          </button>
        ))}
      </div>

      {/* Complaints List */}
      {loading ? (
        <div className="p-12 text-center text-slate-400 text-xs">
          <div className="w-6 h-6 border-2 border-emerald-500 border-t-transparent rounded-full animate-spin mx-auto mb-2"></div>
          Loading your complaint history...
        </div>
      ) : filtered.length === 0 ? (
        <div className="bg-white rounded-2xl border border-slate-200 p-12 text-center space-y-3">
          <div className="w-12 h-12 rounded-full bg-slate-100 text-slate-400 flex items-center justify-center mx-auto">
            <Clock className="h-6 w-6" />
          </div>
          <h3 className="text-base font-bold text-slate-800">No complaints found</h3>
          <p className="text-xs text-slate-500 max-w-sm mx-auto">
            {filterStatus === 'all'
              ? "You haven't filed any municipal complaints yet. Notice overflowing trash or a damaged bin? Let the sanitation team know!"
              : `No reports currently categorized under "${filterStatus.replace('_', ' ')}".`}
          </p>
          {filterStatus === 'all' && (
            <Link
              to="/citizen/report"
              className="inline-flex items-center gap-2 px-4 py-2 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-xl shadow-xs transition-colors mt-2"
            >
              <Plus className="h-4 w-4" /> File Your First Report
            </Link>
          )}
        </div>
      ) : (
        <div className="space-y-4">
          {filtered.map((item) => {
            const step1Submitted = true;
            const step2Assigned = item.status === 'assigned' || item.status === 'collected' || item.status === 'resolved' || Boolean(item.assigned_driver_id) || item.status === 'in_progress';
            const step3Collected = item.status === 'collected' || item.status === 'resolved';
            const step4Resolved = item.status === 'resolved';

            const progressWidth = step4Resolved ? '100%' : step3Collected ? '66.6%' : step2Assigned ? '33.3%' : '0%';

            return (
              <div
                key={item.id}
                className="bg-white rounded-2xl border border-slate-200 p-5 sm:p-6 shadow-xs hover:border-slate-300 transition-all space-y-5"
              >
                {/* Header row */}
                <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2 border-b border-slate-100 pb-3">
                  <div className="flex items-center gap-2.5 flex-wrap">
                    <span className="font-mono text-xs font-black text-slate-900 bg-slate-100 px-2 py-0.5 rounded">
                      #{item.id}
                    </span>
                    {getTypeBadge(item.type)}
                    {getStatusBadge(item.status)}
                  </div>
                  <div className="text-[11px] text-slate-400 font-medium">
                    Reported on {new Date(item.created_at).toLocaleDateString()} at {new Date(item.created_at).toLocaleTimeString([], { hour: '2-digit', minute: '2-digit' })}
                  </div>
                </div>

                {/* 4-Step Resolution Timeline: Submitted -> Driver Assigned -> Bin Collected -> Resolved */}
                <div className="bg-slate-50/80 rounded-2xl p-4 sm:p-5 border border-slate-200/80">
                  <div className="flex items-center justify-between mb-3">
                    <span className="text-[10px] font-extrabold text-slate-500 uppercase tracking-wider">
                      Complaint Resolution Pipeline
                    </span>
                    <span className="text-[10px] font-bold text-slate-600 bg-white px-2 py-0.5 rounded-full border border-slate-200">
                      Step {step4Resolved ? '4 of 4: Resolved' : step3Collected ? '3 of 4: Bin Collected' : step2Assigned ? '2 of 4: Driver Assigned' : '1 of 4: Submitted'}
                    </span>
                  </div>

                  <div className="flex items-center justify-between relative px-2 sm:px-6">
                    {/* Connecting Bar Background */}
                    <div className="absolute top-4 left-6 right-6 sm:left-12 sm:right-12 h-1 bg-slate-200 z-0">
                      <div
                        className="h-full bg-emerald-500 transition-all duration-500 rounded-full"
                        style={{ width: progressWidth }}
                      ></div>
                    </div>

                    {/* Step 1: Submitted */}
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
                          step1Submitted
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-400'
                        }`}
                      >
                        ✓
                      </div>
                      <span className="text-[11px] font-extrabold text-slate-900 mt-1.5">Submitted</span>
                      <span className="text-[9px] text-slate-400 hidden sm:block">Under Review</span>
                    </div>

                    {/* Step 2: Driver Assigned */}
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
                          step2Assigned
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-400'
                        }`}
                      >
                        {step2Assigned ? '✓' : '2'}
                      </div>
                      <span className="text-[11px] font-extrabold text-slate-900 mt-1.5">Driver Assigned</span>
                      <span className="text-[9px] text-slate-400 hidden sm:block">
                        {item.assigned_driver_name ? item.assigned_driver_name : 'Dispatch Ordered'}
                      </span>
                    </div>

                    {/* Step 3: Bin Collected */}
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
                          step3Collected
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-400'
                        }`}
                      >
                        {step3Collected ? '✓' : '3'}
                      </div>
                      <span className="text-[11px] font-extrabold text-slate-900 mt-1.5">Bin Collected</span>
                      <span className="text-[9px] text-slate-400 hidden sm:block">
                        {step3Collected ? 'Waste Emptied' : 'Pending Pickup'}
                      </span>
                    </div>

                    {/* Step 4: Resolved */}
                    <div className="relative z-10 flex flex-col items-center text-center">
                      <div
                        className={`w-8 h-8 rounded-full flex items-center justify-center text-xs font-black border-2 transition-all ${
                          step4Resolved
                            ? 'bg-emerald-600 border-emerald-600 text-white shadow-xs'
                            : 'bg-white border-slate-300 text-slate-400'
                        }`}
                      >
                        {step4Resolved ? '✓' : '4'}
                      </div>
                      <span className="text-[11px] font-extrabold text-slate-900 mt-1.5">Resolved</span>
                      <span className="text-[9px] text-slate-400 hidden sm:block">
                        {item.resolved_at ? new Date(item.resolved_at).toLocaleDateString() : 'Final Sign-off'}
                      </span>
                    </div>
                  </div>
                </div>

                {/* Body Details */}
                <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
                  {/* Left 2 cols: description, bin info, resolution note */}
                  <div className="md:col-span-2 space-y-3">
                    <div>
                      <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                        Report Description
                      </h4>
                      <p className="text-xs text-slate-800 bg-slate-50 p-3 rounded-xl border border-slate-100 leading-relaxed">
                        {item.description}
                      </p>
                    </div>

                    {/* Linked Bin Info */}
                    {item.bin_code && (
                      <div className="flex items-center gap-2 text-xs bg-emerald-50/60 border border-emerald-200/80 px-3 py-2 rounded-xl text-emerald-950 font-medium">
                        <MapPin className="h-4 w-4 text-emerald-600 shrink-0" />
                        <div>
                          <span className="font-bold">{item.bin_code}:</span> {item.bin_location}
                          {item.current_fill_percent !== null && (
                            <span className="ml-2 text-[10px] bg-emerald-100 text-emerald-800 px-1.5 py-0.5 rounded font-bold">
                              {item.current_fill_percent}% Full
                            </span>
                          )}
                        </div>
                      </div>
                    )}

                    {/* Official Resolution Note */}
                    {item.resolution_note && (
                      <div className="bg-teal-50 border border-teal-200 rounded-xl p-3 text-xs text-teal-950">
                        <div className="font-bold flex items-center gap-1.5 text-teal-900 mb-0.5">
                          <CheckCircle2 className="h-4 w-4 text-teal-600" />
                          Municipal Dispatch Update:
                        </div>
                        <p className="text-teal-900 leading-relaxed">{item.resolution_note}</p>
                      </div>
                    )}
                  </div>

                  {/* Right col: Photo Thumbnail */}
                  <div>
                    <h4 className="text-xs font-bold text-slate-700 uppercase tracking-wider mb-1">
                      Evidence Photo
                    </h4>
                    {item.photo_url ? (
                      <div
                        onClick={() => setSelectedPhoto(item.photo_url)}
                        className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-100 cursor-pointer group h-32 w-full"
                      >
                        <img
                          src={item.photo_url}
                          alt="Evidence"
                          className="w-full h-full object-cover group-hover:scale-105 transition-transform duration-300"
                        />
                        <div className="absolute inset-0 bg-black/40 opacity-0 group-hover:opacity-100 transition-opacity flex items-center justify-center text-white text-xs font-bold gap-1">
                          <Eye className="h-4 w-4" /> View Full
                        </div>
                      </div>
                    ) : (
                      <div className="h-32 rounded-xl border border-dashed border-slate-200 bg-slate-50 flex flex-col items-center justify-center text-slate-400 text-xs text-center p-3">
                        <FileText className="h-5 w-5 mb-1 opacity-40" />
                        No photo attached
                      </div>
                    )}
                  </div>
                </div>
              </div>
            );
          })}
        </div>
      )}

      {/* Photo Lightbox Modal */}
      {selectedPhoto && (
        <div
          className="fixed inset-0 z-50 bg-black/80 backdrop-blur-xs flex items-center justify-center p-4 animate-in fade-in duration-200"
          onClick={() => setSelectedPhoto(null)}
        >
          <div
            className="relative max-w-3xl max-h-[90vh] bg-slate-900 rounded-2xl overflow-hidden shadow-2xl border border-slate-800"
            onClick={(e) => e.stopPropagation()}
          >
            <button
              onClick={() => setSelectedPhoto(null)}
              className="absolute top-3 right-3 p-2 rounded-full bg-black/60 hover:bg-black/80 text-white z-10 transition-colors"
            >
              <X className="h-5 w-5" />
            </button>
            <img
              src={selectedPhoto}
              alt="Full size evidence"
              className="w-full h-auto max-h-[85vh] object-contain"
            />
          </div>
        </div>
      )}
    </div>
  );
}
