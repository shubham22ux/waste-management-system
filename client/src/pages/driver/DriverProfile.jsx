import React, { useEffect, useState } from 'react';
import { apiFetch } from '../../api';
import { useAuth } from '../../context/AuthContext';
import { User, ShieldCheck, Truck, Phone, Award, Route, CheckCircle, Navigation } from 'lucide-react';

export default function DriverProfile() {
  const { user } = useAuth();
  const [profile, setProfile] = useState(null);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchProfile = async () => {
      try {
        setLoading(true);
        const res = await apiFetch('/api/driver/profile');
        if (res.ok) {
          const data = await res.json();
          setProfile(data);
        }
      } catch (err) {
        console.error('Failed to load profile:', err);
      } finally {
        setLoading(false);
      }
    };

    fetchProfile();
  }, []);

  return (
    <div className="space-y-5 max-w-xl mx-auto md:max-w-3xl w-full px-3 sm:px-4 pb-12 overflow-x-hidden">
      <div>
        <h2 className="text-lg sm:text-xl font-black text-slate-900 flex items-center gap-2">
          <User className="h-5 w-5 sm:h-6 sm:w-6 text-teal-600 shrink-0" />
          Driver Profile & Fleet Assignment
        </h2>
        <p className="text-xs text-slate-500 mt-0.5">
          Verify your assigned credentials, fleet vehicle specifications, and collection milestones.
        </p>
      </div>

      <div className="bg-white rounded-3xl border border-slate-200 p-5 sm:p-6 shadow-xs space-y-6">
        {/* User Card */}
        <div className="flex items-center gap-4 border-b border-slate-100 pb-5">
          <div className="h-14 w-14 sm:h-16 sm:w-16 rounded-2xl bg-gradient-to-tr from-teal-600 to-emerald-400 text-white flex items-center justify-center font-black text-2xl shadow-md shrink-0">
            {user?.name ? user.name[0] : 'D'}
          </div>
          <div className="min-w-0">
            <h3 className="text-base sm:text-lg font-black text-slate-900 flex items-center gap-2 truncate">
              {profile?.user?.name || user?.name}
              <ShieldCheck className="h-5 w-5 text-teal-600 shrink-0" />
            </h3>
            <p className="text-xs text-slate-500 truncate">{profile?.user?.email || user?.email}</p>
            <div className="flex items-center gap-2 mt-2 flex-wrap">
              <span className="text-[10px] bg-teal-50 text-teal-700 font-extrabold px-2.5 py-0.5 rounded-full uppercase border border-teal-200">
                Authorized Driver
              </span>
              <span className="text-[10px] bg-emerald-50 text-emerald-700 font-bold px-2.5 py-0.5 rounded-full capitalize border border-emerald-200">
                Availability: {profile?.driver?.availability || 'Available'}
              </span>
            </div>
          </div>
        </div>

        {/* Milestone Stats */}
        <div className="grid grid-cols-3 gap-2 sm:gap-3">
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
            <div className="text-base font-black text-slate-900">
              {profile?.stats?.total_routes_completed || 0}
            </div>
            <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Routes Completed</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
            <div className="text-base font-black text-slate-900">
              {profile?.stats?.total_bins_collected || 0}
            </div>
            <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Bins Emptied</div>
          </div>
          <div className="bg-slate-50 p-3 rounded-xl border border-slate-100 text-center">
            <div className="text-base font-black text-slate-900">
              {profile?.stats?.total_km_driven || 0} <span className="text-[10px] text-slate-400">km</span>
            </div>
            <div className="text-[10px] text-slate-500 font-semibold mt-0.5">Distance Driven</div>
          </div>
        </div>

        {/* Credentials & Details */}
        <div className="space-y-3 text-xs text-slate-700">
          <div className="flex justify-between py-2.5 border-b border-slate-100">
            <span className="font-semibold text-slate-500 flex items-center gap-1.5">
              <Phone className="h-3.5 w-3.5 text-slate-400" />
              Contact Phone:
            </span>
            <span className="font-bold">{profile?.user?.phone || user?.phone || 'Not provided'}</span>
          </div>

          <div className="flex justify-between py-2.5 border-b border-slate-100">
            <span className="font-semibold text-slate-500 flex items-center gap-1.5">
              <Award className="h-3.5 w-3.5 text-slate-400" />
              Driver License Number:
            </span>
            <span className="font-mono bg-slate-100 px-2.5 py-0.5 rounded font-bold text-slate-800">
              {profile?.driver?.license_number || 'KA-01-2022-001'}
            </span>
          </div>

          <div className="flex justify-between py-2.5 border-b border-slate-100">
            <span className="font-semibold text-slate-500 flex items-center gap-1.5">
              <Truck className="h-3.5 w-3.5 text-slate-400" />
              Assigned Fleet Vehicle:
            </span>
            <span className="font-bold text-teal-800">
              {profile?.vehicle
                ? `${profile.vehicle.model} (${profile.vehicle.plate_number})`
                : 'Tata Ace Gold Compactor (KA-01-EA-1001)'}
            </span>
          </div>

          {profile?.vehicle && (
            <div className="flex justify-between py-2.5">
              <span className="font-semibold text-slate-500">Rated Vehicle Mileage:</span>
              <span className="font-semibold text-slate-800">
                {profile.vehicle.avg_mileage_kmpl} km/L ({profile.vehicle.fuel_type})
              </span>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
