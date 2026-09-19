import React, { useState, useEffect, useCallback } from 'react';
import { apiFetch, safeParseJson } from '../api';
import {
  UserCheck,
  UserPlus,
  Trash2,
  ToggleLeft,
  ToggleRight,
  Search,
  Mail,
  Shield,
  AlertCircle,
  CheckCircle2,
  X,
  Loader2,
  User,
  Clock
} from 'lucide-react';

export default function DriverApproval() {
  const [approvedEmails, setApprovedEmails] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState('');
  const [success, setSuccess] = useState('');
  const [searchQuery, setSearchQuery] = useState('');
  const [showAddModal, setShowAddModal] = useState(false);
  const [newEmail, setNewEmail] = useState('');
  const [newName, setNewName] = useState('');
  const [addLoading, setAddLoading] = useState(false);
  const [deleteConfirmId, setDeleteConfirmId] = useState(null);

  const fetchApprovedEmails = useCallback(async () => {
    try {
      setLoading(true);
      const res = await apiFetch('/api/drivers/approved-emails');
      if (res.ok) {
        const data = await safeParseJson(res);
        setApprovedEmails(data);
      } else {
        const data = await safeParseJson(res);
        setError(data.error || 'Failed to fetch approved emails.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchApprovedEmails();
  }, [fetchApprovedEmails]);

  // Clear notifications after 4s
  useEffect(() => {
    if (success) {
      const t = setTimeout(() => setSuccess(''), 4000);
      return () => clearTimeout(t);
    }
  }, [success]);

  useEffect(() => {
    if (error) {
      const t = setTimeout(() => setError(''), 6000);
      return () => clearTimeout(t);
    }
  }, [error]);

  const handleAddEmail = async (e) => {
    e.preventDefault();
    if (!newEmail.trim()) return;

    try {
      setAddLoading(true);
      setError('');
      const res = await apiFetch('/api/drivers/approved-emails', {
        method: 'POST',
        body: JSON.stringify({ email: newEmail.trim(), name: newName.trim() || null })
      });
      const data = await safeParseJson(res);
      if (res.ok) {
        setSuccess(data.message || 'Driver email approved successfully.');
        setNewEmail('');
        setNewName('');
        setShowAddModal(false);
        fetchApprovedEmails();
      } else {
        setError(data.error || 'Failed to approve email.');
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setAddLoading(false);
    }
  };

  const handleToggleActive = async (id) => {
    try {
      setError('');
      const res = await apiFetch(`/api/drivers/approved-emails/${id}`, { method: 'PUT' });
      const data = await safeParseJson(res);
      if (res.ok) {
        setSuccess(data.message);
        fetchApprovedEmails();
      } else {
        setError(data.error || 'Failed to toggle status.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const handleDelete = async (id) => {
    try {
      setError('');
      const res = await apiFetch(`/api/drivers/approved-emails/${id}`, { method: 'DELETE' });
      const data = await safeParseJson(res);
      if (res.ok) {
        setSuccess(data.message || 'Approval removed.');
        setDeleteConfirmId(null);
        fetchApprovedEmails();
      } else {
        setError(data.error || 'Failed to delete.');
      }
    } catch (err) {
      setError(err.message);
    }
  };

  const filteredEmails = approvedEmails.filter((item) => {
    if (!searchQuery.trim()) return true;
    const q = searchQuery.toLowerCase();
    return (
      (item.email && item.email.toLowerCase().includes(q)) ||
      (item.name && item.name.toLowerCase().includes(q))
    );
  });

  const activeCount = approvedEmails.filter((e) => e.is_active).length;
  const inactiveCount = approvedEmails.filter((e) => !e.is_active).length;

  return (
    <div className="p-6 max-w-6xl mx-auto space-y-6">
      {/* Page Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-4">
        <div>
          <h1 className="text-2xl font-black text-white flex items-center gap-3">
            <div className="h-10 w-10 rounded-xl bg-gradient-to-tr from-emerald-600 to-teal-400 flex items-center justify-center shadow-lg">
              <UserCheck className="h-5 w-5 text-white" />
            </div>
            Driver Email Approvals
          </h1>
          <p className="text-sm text-slate-400 mt-1">
            Manage which driver emails are authorized to log in with OTP verification
          </p>
        </div>

        <button
          onClick={() => setShowAddModal(true)}
          className="flex items-center gap-2 px-5 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-900/30 transition-all cursor-pointer"
        >
          <UserPlus className="h-4 w-4" />
          Approve New Email
        </button>
      </div>

      {/* Stats Cards */}
      <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-lg bg-teal-500/15 flex items-center justify-center">
            <Mail className="h-5 w-5 text-teal-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white">{approvedEmails.length}</div>
            <div className="text-xs text-slate-400 font-medium">Total Approved</div>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-lg bg-emerald-500/15 flex items-center justify-center">
            <CheckCircle2 className="h-5 w-5 text-emerald-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white">{activeCount}</div>
            <div className="text-xs text-slate-400 font-medium">Active</div>
          </div>
        </div>
        <div className="bg-slate-800/60 border border-slate-700/50 rounded-xl p-4 flex items-center gap-4">
          <div className="h-11 w-11 rounded-lg bg-amber-500/15 flex items-center justify-center">
            <Shield className="h-5 w-5 text-amber-400" />
          </div>
          <div>
            <div className="text-2xl font-black text-white">{inactiveCount}</div>
            <div className="text-xs text-slate-400 font-medium">Deactivated</div>
          </div>
        </div>
      </div>

      {/* Notifications */}
      {error && (
        <div className="p-3 bg-rose-500/10 border border-rose-500/30 text-rose-300 rounded-xl text-sm flex items-center gap-2">
          <AlertCircle className="h-4 w-4 shrink-0" />
          <span>{error}</span>
        </div>
      )}
      {success && (
        <div className="p-3 bg-emerald-500/10 border border-emerald-500/30 text-emerald-300 rounded-xl text-sm flex items-center gap-2">
          <CheckCircle2 className="h-4 w-4 shrink-0" />
          <span>{success}</span>
        </div>
      )}

      {/* Search Bar */}
      <div className="relative">
        <Search className="absolute left-3.5 top-1/2 -translate-y-1/2 h-4 w-4 text-slate-500" />
        <input
          type="text"
          placeholder="Search by email or name..."
          value={searchQuery}
          onChange={(e) => setSearchQuery(e.target.value)}
          className="w-full pl-10 pr-4 py-2.5 bg-slate-800/60 border border-slate-700/50 rounded-xl text-sm text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
        />
      </div>

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16 text-teal-400">
          <Loader2 className="h-6 w-6 animate-spin mr-3" />
          <span className="text-sm font-medium">Loading approved emails...</span>
        </div>
      ) : filteredEmails.length === 0 ? (
        <div className="text-center py-16 text-slate-500">
          <UserCheck className="h-12 w-12 mx-auto mb-3 opacity-40" />
          <p className="text-sm font-medium">
            {approvedEmails.length === 0
              ? 'No driver emails approved yet. Click "Approve New Email" to get started.'
              : 'No results match your search.'}
          </p>
        </div>
      ) : (
        <div className="bg-slate-800/40 border border-slate-700/50 rounded-xl overflow-hidden">
          <div className="overflow-x-auto">
            <table className="w-full text-sm text-left">
              <thead>
                <tr className="bg-slate-800/80 border-b border-slate-700/50">
                  <th className="px-5 py-3.5 font-semibold text-slate-300 text-xs uppercase tracking-wider">Driver</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-300 text-xs uppercase tracking-wider">Email</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-300 text-xs uppercase tracking-wider">Status</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-300 text-xs uppercase tracking-wider">Approved Date</th>
                  <th className="px-5 py-3.5 font-semibold text-slate-300 text-xs uppercase tracking-wider text-right">Actions</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-slate-700/30">
                {filteredEmails.map((item) => (
                  <tr
                    key={item.id}
                    className={`transition-colors ${item.is_active ? 'hover:bg-slate-700/20' : 'bg-slate-800/20 opacity-60'}`}
                  >
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-3">
                        <div className={`h-8 w-8 rounded-lg flex items-center justify-center text-xs font-bold ${
                          item.is_active
                            ? 'bg-gradient-to-tr from-emerald-600 to-teal-500 text-white'
                            : 'bg-slate-700 text-slate-400'
                        }`}>
                          {item.name ? item.name.charAt(0).toUpperCase() : <User className="h-4 w-4" />}
                        </div>
                        <span className="font-medium text-white">
                          {item.name || '—'}
                        </span>
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center gap-2 text-slate-300 font-mono text-xs">
                        <Mail className="h-3.5 w-3.5 text-slate-500" />
                        {item.email}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      {item.is_active ? (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-emerald-500/15 text-emerald-400 text-xs font-bold rounded-full">
                          <CheckCircle2 className="h-3 w-3" /> Active
                        </span>
                      ) : (
                        <span className="inline-flex items-center gap-1.5 px-2.5 py-1 bg-amber-500/15 text-amber-400 text-xs font-bold rounded-full">
                          <Shield className="h-3 w-3" /> Inactive
                        </span>
                      )}
                    </td>
                    <td className="px-5 py-3.5 text-xs text-slate-400">
                      <div className="flex items-center gap-1.5">
                        <Clock className="h-3 w-3" />
                        {item.approved_at
                          ? new Date(item.approved_at).toLocaleDateString('en-IN', {
                              day: 'numeric',
                              month: 'short',
                              year: 'numeric'
                            })
                          : '—'}
                      </div>
                    </td>
                    <td className="px-5 py-3.5">
                      <div className="flex items-center justify-end gap-2">
                        {/* Toggle Active/Inactive */}
                        <button
                          onClick={() => handleToggleActive(item.id)}
                          title={item.is_active ? 'Deactivate' : 'Activate'}
                          className={`p-2 rounded-lg transition-colors cursor-pointer ${
                            item.is_active
                              ? 'text-emerald-400 hover:bg-emerald-500/15'
                              : 'text-amber-400 hover:bg-amber-500/15'
                          }`}
                        >
                          {item.is_active ? <ToggleRight className="h-5 w-5" /> : <ToggleLeft className="h-5 w-5" />}
                        </button>

                        {/* Delete */}
                        {deleteConfirmId === item.id ? (
                          <div className="flex items-center gap-1">
                            <button
                              onClick={() => handleDelete(item.id)}
                              className="px-2.5 py-1.5 bg-rose-600 hover:bg-rose-700 text-white text-xs font-bold rounded-lg transition-colors cursor-pointer"
                            >
                              Confirm
                            </button>
                            <button
                              onClick={() => setDeleteConfirmId(null)}
                              className="p-1.5 text-slate-400 hover:text-white rounded-lg transition-colors cursor-pointer"
                            >
                              <X className="h-4 w-4" />
                            </button>
                          </div>
                        ) : (
                          <button
                            onClick={() => setDeleteConfirmId(item.id)}
                            title="Remove approval"
                            className="p-2 text-rose-400/60 hover:text-rose-400 hover:bg-rose-500/10 rounded-lg transition-colors cursor-pointer"
                          >
                            <Trash2 className="h-4 w-4" />
                          </button>
                        )}
                      </div>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}

      {/* Add Modal */}
      {showAddModal && (
        <div className="fixed inset-0 bg-slate-950/70 backdrop-blur-sm flex items-center justify-center z-50 p-4">
          <div className="w-full max-w-md bg-slate-900 border border-slate-700/50 rounded-2xl shadow-2xl overflow-hidden">
            <div className="bg-gradient-to-r from-emerald-800 to-teal-700 p-5 text-white flex items-center justify-between">
              <div className="flex items-center gap-3">
                <div className="h-9 w-9 rounded-xl bg-white/10 flex items-center justify-center">
                  <UserPlus className="h-5 w-5 text-teal-300" />
                </div>
                <div>
                  <h3 className="font-bold text-lg">Approve Driver Email</h3>
                  <p className="text-xs text-emerald-100/80">Authorize a new driver email for OTP login</p>
                </div>
              </div>
              <button
                onClick={() => setShowAddModal(false)}
                className="p-1.5 hover:bg-white/10 rounded-lg transition-colors cursor-pointer"
              >
                <X className="h-5 w-5" />
              </button>
            </div>

            <form onSubmit={handleAddEmail} className="p-5 space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Driver Email Address *
                </label>
                <input
                  type="email"
                  value={newEmail}
                  onChange={(e) => setNewEmail(e.target.value)}
                  placeholder="driver@example.com"
                  required
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
                />
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-300 uppercase tracking-wider mb-1.5">
                  Driver Name (Optional)
                </label>
                <input
                  type="text"
                  value={newName}
                  onChange={(e) => setNewName(e.target.value)}
                  placeholder="e.g. Rajesh Kumar"
                  className="w-full px-3.5 py-2.5 bg-slate-800 border border-slate-700 rounded-xl text-sm text-white placeholder:text-slate-500 focus:border-teal-500 focus:ring-2 focus:ring-teal-500/20 outline-none transition-all"
                />
              </div>

              <div className="p-3 bg-teal-500/10 border border-teal-500/20 rounded-xl text-xs text-teal-300">
                <Shield className="h-3.5 w-3.5 inline mr-1.5" />
                Once approved, this driver can log in using their email and receive OTP verification codes.
              </div>

              <div className="flex items-center gap-3 pt-2">
                <button
                  type="submit"
                  disabled={addLoading || !newEmail.trim()}
                  className="flex-1 py-2.5 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-sm shadow-lg flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
                >
                  {addLoading ? (
                    <>
                      <Loader2 className="h-4 w-4 animate-spin" /> Approving...
                    </>
                  ) : (
                    <>
                      <CheckCircle2 className="h-4 w-4" /> Approve Email
                    </>
                  )}
                </button>
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-5 py-2.5 bg-slate-800 hover:bg-slate-700 text-slate-300 font-semibold rounded-xl text-sm transition-colors cursor-pointer"
                >
                  Cancel
                </button>
              </div>
            </form>
          </div>
        </div>
      )}
    </div>
  );
}
