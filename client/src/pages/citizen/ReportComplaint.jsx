import React, { useState, useEffect, useRef } from 'react';
import { useSearchParams, useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../../context/AuthContext';
import { apiFetch, getApiUrl } from '../../api';
import {
  MessageSquareWarning,
  Send,
  UploadCloud,
  CheckCircle2,
  AlertCircle,
  Trash2,
  Image as ImageIcon,
  X,
  MapPin,
  ListOrdered,
  ArrowRight,
  ShieldAlert
} from 'lucide-react';

export default function ReportComplaint() {
  const { user } = useAuth();
  const [searchParams] = useSearchParams();
  const navigate = useNavigate();

  const [bins, setBins] = useState([]);
  const [loadingBins, setLoadingBins] = useState(true);

  const [type, setType] = useState('overflowing_bin');
  const [binId, setBinId] = useState(searchParams.get('bin_id') || '');
  const [description, setDescription] = useState('');
  const [selectedFile, setSelectedFile] = useState(null);
  const [previewUrl, setPreviewUrl] = useState(null);

  const [submitting, setSubmitting] = useState(false);
  const [successResult, setSuccessResult] = useState(null);
  const [errorMsg, setErrorMsg] = useState(null);

  const fileInputRef = useRef(null);

  // Fetch available bins for dropdown
  useEffect(() => {
    const fetchBins = async () => {
      try {
        const res = await apiFetch('/api/bins');
        if (res.ok) {
          const data = await res.json();
          setBins(data);
        }
      } catch (err) {
        console.error('Failed to load bins for complaint form', err);
      } finally {
        setLoadingBins(false);
      }
    };
    fetchBins();
  }, []);

  // Update binId if query param changes
  useEffect(() => {
    const paramBin = searchParams.get('bin_id');
    if (paramBin) {
      setBinId(paramBin);
    }
  }, [searchParams]);

  // Handle image selection
  const handleFileChange = (e) => {
    const file = e.target.files?.[0];
    if (file) {
      if (file.size > 5 * 1024 * 1024) {
        setErrorMsg('Image size exceeds maximum limit of 5MB.');
        return;
      }
      setSelectedFile(file);
      setPreviewUrl(URL.createObjectURL(file));
      setErrorMsg(null);
    }
  };

  const removePhoto = () => {
    setSelectedFile(null);
    if (previewUrl) URL.revokeObjectURL(previewUrl);
    setPreviewUrl(null);
    if (fileInputRef.current) fileInputRef.current.value = '';
  };

  const handleSubmit = async (e) => {
    e.preventDefault();
    if (!description.trim()) {
      setErrorMsg('Please enter a description for your report.');
      return;
    }

    setSubmitting(true);
    setErrorMsg(null);

    try {
      let photoUrl = null;

      // 1. Upload photo if selected
      if (selectedFile) {
        const formData = new FormData();
        formData.append('photo', selectedFile);

        const token = localStorage.getItem('smartwaste_token');
        const uploadRes = await fetch(getApiUrl('/api/complaints/upload'), {
          method: 'POST',
          headers: token ? { Authorization: `Bearer ${token}` } : {},
          body: formData
        });

        if (!uploadRes.ok) {
          const upErr = await uploadRes.json();
          throw new Error(upErr.error || 'Failed to upload photo');
        }

        const upData = await uploadRes.json();
        photoUrl = upData.photoUrl;
      }

      // 2. Submit complaint record
      const complaintPayload = {
        citizen_id: user?.id,
        bin_id: binId ? Number(binId) : null,
        type,
        description: description.trim(),
        photo_url: photoUrl
      };

      const res = await apiFetch('/api/complaints', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(complaintPayload)
      });

      const resData = await res.json();
      if (!res.ok) {
        throw new Error(resData.error || 'Failed to submit complaint.');
      }

      setSuccessResult(resData);
      setDescription('');
      removePhoto();
    } catch (err) {
      console.error('Submission error:', err);
      setErrorMsg(err.message || 'Something went wrong while submitting report.');
    } finally {
      setSubmitting(false);
    }
  };

  return (
    <div className="space-y-6 max-w-3xl mx-auto pb-12">
      {/* Top Header */}
      <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3 border-b border-slate-200 pb-4">
        <div>
          <h2 className="text-2xl font-black text-slate-900 flex items-center gap-2.5">
            <div className="p-2 bg-emerald-100 text-emerald-700 rounded-xl">
              <MessageSquareWarning className="h-6 w-6" />
            </div>
            Report Waste Complaint
          </h2>
          <p className="text-xs text-slate-500 mt-1">
            Submit civic reports directly to municipal sanitation supervisors for rapid response.
          </p>
        </div>

        <Link
          to="/citizen/complaints"
          className="inline-flex items-center gap-1.5 px-3.5 py-2 bg-slate-100 hover:bg-slate-200 text-slate-700 text-xs font-bold rounded-xl transition-colors self-start sm:self-auto"
        >
          <ListOrdered className="h-4 w-4 text-slate-500" />
          My Submitted Reports
        </Link>
      </div>

      {/* Success Notification Alert */}
      {successResult && (
        <div className="p-5 bg-emerald-50 border border-emerald-300 rounded-2xl flex flex-col sm:flex-row items-start sm:items-center justify-between gap-4 shadow-xs">
          <div className="flex items-start gap-3">
            <CheckCircle2 className="h-6 w-6 text-emerald-600 shrink-0 mt-0.5" />
            <div>
              <h4 className="text-sm font-bold text-emerald-950">Grievance Ticket Submitted Successfully!</h4>
              <p className="text-xs text-emerald-800 mt-0.5">
                Ticket <span className="font-mono font-bold">#{successResult.id}</span> has been routed to the municipal dispatch team.
              </p>
            </div>
          </div>
          <div className="flex items-center gap-2 shrink-0">
            <button
              onClick={() => setSuccessResult(null)}
              className="px-3 py-1.5 bg-white text-slate-600 hover:text-slate-900 border border-slate-200 text-xs font-bold rounded-lg transition-colors"
            >
              File Another
            </button>
            <button
              onClick={() => navigate('/citizen/complaints')}
              className="px-3.5 py-1.5 bg-emerald-600 hover:bg-emerald-700 text-white text-xs font-bold rounded-lg shadow-xs flex items-center gap-1 transition-colors"
            >
              Track Status <ArrowRight className="h-3.5 w-3.5" />
            </button>
          </div>
        </div>
      )}

      {/* Error Alert */}
      {errorMsg && (
        <div className="p-4 bg-rose-50 border border-rose-200 rounded-xl flex items-center gap-3 text-rose-700 text-xs font-medium">
          <AlertCircle className="h-5 w-5 shrink-0 text-rose-600" />
          <span>{errorMsg}</span>
        </div>
      )}

      {/* Main Report Form */}
      <form onSubmit={handleSubmit} className="bg-white rounded-2xl border border-slate-200 p-6 md:p-8 shadow-xs space-y-6">
        {/* Complaint Type Grid Selector - Large Clickable Option Cards */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-2.5">
            Select Complaint Category <span className="text-rose-500">*</span>
          </label>
          <div className="grid grid-cols-1 sm:grid-cols-2 lg:grid-cols-3 gap-3">
            {[
              {
                id: 'overflowing_bin',
                title: 'Bin is Full / Overflowing',
                desc: 'Waste spilling over, lid cannot close, or piled around bin',
                icon: ShieldAlert,
                color: 'text-rose-600',
                activeBg: 'border-rose-500 bg-rose-50/40 ring-2 ring-rose-200'
              },
              {
                id: 'damaged_bin',
                title: 'Bin is Broken / Damaged',
                desc: 'Cracked body, broken wheels, detached lid, or vandalized',
                icon: Trash2,
                color: 'text-amber-600',
                activeBg: 'border-amber-500 bg-amber-50/40 ring-2 ring-amber-200'
              },
              {
                id: 'missed_collection',
                title: 'Collection Was Missed',
                desc: 'Scheduled truck did not service this area or bin today',
                icon: MapPin,
                color: 'text-blue-600',
                activeBg: 'border-blue-500 bg-blue-50/40 ring-2 ring-blue-200'
              },
              {
                id: 'illegal_dumping',
                title: 'Illegal Dumping',
                desc: 'Unauthorized debris, bulk waste, commercial dumping on street',
                icon: AlertCircle,
                color: 'text-purple-600',
                activeBg: 'border-purple-500 bg-purple-50/40 ring-2 ring-purple-200'
              },
              {
                id: 'other',
                title: 'Other',
                desc: 'Hazardous chemicals, severe odors, or miscellaneous issues',
                icon: MessageSquareWarning,
                color: 'text-slate-600',
                activeBg: 'border-slate-700 bg-slate-50 ring-2 ring-slate-200'
              }
            ].map((cat) => {
              const Icon = cat.icon;
              const isSelected = type === cat.id;
              return (
                <button
                  type="button"
                  key={cat.id}
                  onClick={() => setType(cat.id)}
                  className={`p-4 rounded-2xl border-2 text-left transition-all cursor-pointer flex flex-col justify-between min-h-[110px] ${
                    isSelected
                      ? `${cat.activeBg} shadow-sm`
                      : 'border-slate-200 hover:border-slate-300 bg-white hover:bg-slate-50/60'
                  }`}
                >
                  <div className="flex items-start justify-between gap-2 mb-2">
                    <div className={`p-2 rounded-xl bg-white border border-slate-200 shadow-2xs ${cat.color}`}>
                      <Icon className="h-5 w-5" />
                    </div>
                    <div className={`w-5 h-5 rounded-full border-2 flex items-center justify-center transition-colors ${
                      isSelected ? 'border-emerald-600 bg-emerald-600 text-white' : 'border-slate-300 bg-white'
                    }`}>
                      {isSelected && <span className="text-[10px] font-bold">✓</span>}
                    </div>
                  </div>
                  <div>
                    <div className="text-xs font-bold text-slate-900 leading-snug">
                      {cat.title}
                    </div>
                    <p className="text-[11px] text-slate-500 mt-1 leading-tight">{cat.desc}</p>
                  </div>
                </button>
              );
            })}
          </div>
        </div>

        {/* Target Bin Dropdown (Optional) */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="text-xs font-bold uppercase tracking-wider text-slate-700">
              Select Specific Waste Bin (Optional)
            </label>
            <Link
              to="/citizen/bins"
              className="text-[11px] font-bold text-emerald-600 hover:text-emerald-700 flex items-center gap-1"
            >
              <MapPin className="h-3 w-3" /> View Map of Bins
            </Link>
          </div>
          <select
            value={binId}
            onChange={(e) => setBinId(e.target.value)}
            disabled={loadingBins}
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs font-medium text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none transition-colors"
          >
            <option value="">-- General Area / No Specific Bin --</option>
            {bins.map((b) => (
              <option key={b.id} value={b.id}>
                {b.bin_code} - {b.location_name} (Current Fill: {b.current_fill_percent}%{b.status === 'damaged' ? ' - DAMAGED' : ''})
              </option>
            ))}
          </select>
          <p className="text-[11px] text-slate-400 mt-1">
            Linking a bin allows the municipal dispatch team to route urgent pickup trucks directly.
          </p>
        </div>

        {/* Detailed Description */}
        <div>
          <label className="block text-xs font-bold uppercase tracking-wider text-slate-700 mb-1.5">
            Detailed Description <span className="text-rose-500">*</span>
          </label>
          <textarea
            rows={4}
            value={description}
            onChange={(e) => setDescription(e.target.value)}
            placeholder="Please detail the issue, specific landmark or corner, severity, and any hazards..."
            className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-xs text-slate-800 focus:bg-white focus:border-emerald-500 focus:outline-none transition-colors leading-relaxed"
            required
          />
          <div className="flex justify-between items-center text-[10px] text-slate-400 mt-1">
            <span>Be as descriptive as possible for the sanitation crew.</span>
            <span>{description.length} characters</span>
          </div>
        </div>

        {/* Photo Upload Section */}
        <div>
          <div className="flex items-center justify-between mb-1.5">
            <label className="block text-xs font-bold uppercase tracking-wider text-slate-700">
              Add a photo (optional)
            </label>
            <span className="text-[11px] text-slate-400">JPG or PNG up to 5MB</span>
          </div>

          {previewUrl ? (
            <div className="p-3 bg-slate-50 rounded-2xl border border-slate-200 max-w-md space-y-3">
              <div className="relative rounded-xl overflow-hidden border border-slate-200 bg-slate-900 group h-48">
                <img
                  src={previewUrl}
                  alt="Complaint preview"
                  className="w-full h-full object-cover"
                />
              </div>
              <div className="flex items-center justify-between">
                <span className="text-xs text-slate-600 truncate max-w-[240px] font-medium">
                  {selectedFile?.name} ({(selectedFile?.size / (1024 * 1024)).toFixed(2)} MB)
                </span>
                <button
                  type="button"
                  onClick={removePhoto}
                  className="inline-flex items-center gap-1.5 px-3 py-1.5 bg-rose-50 hover:bg-rose-100 text-rose-700 border border-rose-200 text-xs font-bold rounded-lg transition-colors cursor-pointer"
                >
                  <Trash2 className="h-3.5 w-3.5 text-rose-600" /> Remove photo
                </button>
              </div>
            </div>
          ) : (
            <div
              onClick={() => fileInputRef.current?.click()}
              className="border-2 border-dashed border-slate-300 hover:border-emerald-500 bg-slate-50/60 hover:bg-emerald-50/20 rounded-2xl p-6 text-center cursor-pointer transition-colors"
            >
              <input
                type="file"
                ref={fileInputRef}
                onChange={handleFileChange}
                accept="image/jpeg, image/png"
                className="hidden"
              />
              <div className="w-11 h-11 rounded-xl bg-white border border-slate-200 flex items-center justify-center mx-auto mb-2 text-slate-500 shadow-2xs">
                <UploadCloud className="h-6 w-6 text-emerald-600" />
              </div>
              <div className="text-xs font-bold text-slate-800">
                Click to attach photographic evidence
              </div>
              <p className="text-[11px] text-slate-400 mt-0.5">
                Supports JPG, PNG (Max 5MB). Photo is optional.
              </p>
            </div>
          )}
        </div>

        {/* Action Button */}
        <div className="pt-2 border-t border-slate-100 flex items-center justify-end gap-3">
          <button
            type="submit"
            disabled={submitting}
            className="w-full sm:w-auto px-6 py-3 bg-emerald-600 hover:bg-emerald-700 active:bg-emerald-800 text-white font-bold text-xs uppercase tracking-wider rounded-xl shadow-md hover:shadow-lg disabled:opacity-50 transition-all flex items-center justify-center gap-2"
          >
            {submitting ? (
              <>
                <div className="w-4 h-4 border-2 border-white border-t-transparent rounded-full animate-spin"></div>
                Processing Submission...
              </>
            ) : (
              <>
                <Send className="h-4 w-4" /> File Report
              </>
            )}
          </button>
        </div>
      </form>
    </div>
  );
}
