import React, { useState, useEffect } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { useAuth } from '../context/AuthContext';
import {
  Recycle,
  ArrowRight,
  ArrowLeft,
  AlertCircle,
  Mail,
  Shield,
  Truck,
  KeyRound,
  RefreshCw,
  CheckCircle2,
  Lock,
  Users
} from 'lucide-react';

export default function Login() {
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [otp, setOtp] = useState('');
  const [step, setStep] = useState('credentials'); // 'credentials' | 'otp'
  const [maskedEmail, setMaskedEmail] = useState('');
  const [targetRole, setTargetRole] = useState('');
  const [tempToken, setTempToken] = useState('');
  const [error, setError] = useState('');
  const [infoMessage, setInfoMessage] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [resendCooldown, setResendCooldown] = useState(0);

  const { login, requestLoginOtp, verifyLoginOtp } = useAuth();
  const navigate = useNavigate();

  // Handle resend countdown timer
  useEffect(() => {
    let timer;
    if (resendCooldown > 0) {
      timer = setTimeout(() => setResendCooldown((prev) => prev - 1), 1000);
    }
    return () => clearTimeout(timer);
  }, [resendCooldown]);

  const redirectByRole = (user) => {
    if (user.role === 'driver') {
      navigate('/driver/routes');
    } else if (user.role === 'citizen') {
      navigate('/citizen/complaints');
    } else {
      navigate('/');
    }
  };

  // Step 1: Submit Credentials
  const handleSubmitCredentials = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    if (!email.trim() || !password) {
      setError('Please provide both your email and password.');
      return;
    }

    try {
      setSubmitting(true);
      const res = await login(email.trim(), password);

      // If backend requires OTP (mandatory for Admin and Driver)
      if (res && res.requireOtp) {
        setMaskedEmail(res.maskedEmail || email);
        setTargetRole(res.role || '');
        setTempToken(res.tempToken || '');
        setStep('otp');
        setResendCooldown(30);
        setInfoMessage(res.message || 'Verification code sent to your registered email.');
      } else if (res && res.id) {
        // Citizen direct login
        redirectByRole(res);
      }
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Step 2: Verify 6-digit OTP
  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    setError('');
    setInfoMessage('');

    const cleanOtp = otp.trim();
    if (!cleanOtp || cleanOtp.length !== 6) {
      setError('Please enter a valid 6-digit verification code.');
      return;
    }

    try {
      setSubmitting(true);
      const user = await verifyLoginOtp(email.trim(), cleanOtp, tempToken);
      redirectByRole(user);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  // Resend OTP handler
  const handleResendOtp = async () => {
    if (resendCooldown > 0 || submitting) return;
    setError('');
    setInfoMessage('');

    try {
      setSubmitting(true);
      const res = await requestLoginOtp(email.trim(), password);
      setMaskedEmail(res.maskedEmail || email);
      setTempToken(res.tempToken || '');
      setResendCooldown(30);
      setInfoMessage(`A fresh 6-digit code has been dispatched to ${res.maskedEmail || 'your email'}.`);
    } catch (err) {
      setError(err.message);
    } finally {
      setSubmitting(false);
    }
  };

  const handleBackToCredentials = () => {
    setStep('credentials');
    setOtp('');
    setTempToken('');
    setError('');
    setInfoMessage('');
  };

  return (
    <div className="min-h-screen bg-slate-950 flex items-center justify-center p-4">
      <div className="w-full max-w-md bg-white rounded-2xl shadow-2xl overflow-hidden border border-slate-800 transition-all">
        {/* Top Header Card */}
        <div className="bg-gradient-to-r from-emerald-800 to-teal-700 p-6 text-white text-center relative">
          <div className="mx-auto h-14 w-14 rounded-2xl bg-white/10 backdrop-blur-md border border-white/20 flex items-center justify-center mb-3 shadow-inner">
            <Recycle className="h-8 w-8 text-teal-300 animate-spin-slow" />
          </div>
          <h1 className="text-2xl font-black tracking-tight">
            Smart<span className="text-teal-300">Waste</span>
          </h1>
          <p className="text-xs text-emerald-100 mt-1 font-medium">
            Municipal Waste & Route Optimization Infrastructure
          </p>
        </div>

        <div className="p-6 space-y-5">
          {/* Error Notification */}
          {error && (
            <div className="p-3 bg-rose-50 border border-rose-200 text-rose-700 rounded-xl text-xs flex items-center gap-2 animate-shake">
              <AlertCircle className="h-4 w-4 shrink-0" />
              <span>{error}</span>
            </div>
          )}

          {/* Info / Dispatch Notification */}
          {infoMessage && (
            <div className="p-3 bg-teal-50 border border-teal-200 text-teal-800 rounded-xl text-xs flex items-center gap-2">
              <CheckCircle2 className="h-4 w-4 shrink-0 text-teal-600" />
              <span>{infoMessage}</span>
            </div>
          )}

          {step === 'credentials' ? (
            /* STEP 1: Enter Credentials */
            <form onSubmit={handleSubmitCredentials} className="space-y-4">
              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Email Address
                </label>
                <div className="relative">
                  <input
                    type="email"
                    value={email}
                    onChange={(e) => setEmail(e.target.value)}
                    placeholder="name@smartwaste.gov or user@gmail.com"
                    autoComplete="email"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              <div>
                <label className="block text-xs font-semibold text-slate-700 uppercase tracking-wider mb-1">
                  Password
                </label>
                <div className="relative">
                  <input
                    type="password"
                    value={password}
                    onChange={(e) => setPassword(e.target.value)}
                    placeholder="••••••••"
                    autoComplete="current-password"
                    className="w-full px-3.5 py-2.5 bg-slate-50 border border-slate-300 rounded-xl text-sm focus:bg-white focus:border-emerald-500 focus:ring-2 focus:ring-emerald-500/20 outline-none transition-all"
                    required
                  />
                </div>
              </div>

              {/* Role Info Cards */}
              <div className="space-y-2 pt-1">
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <Shield className="h-4 w-4 text-emerald-600 shrink-0" />
                  <span className="text-[11px] text-slate-500">
                    <strong className="text-slate-700">Admin:</strong> OTP sent to designated admin inbox
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <Truck className="h-4 w-4 text-teal-600 shrink-0" />
                  <span className="text-[11px] text-slate-500">
                    <strong className="text-slate-700">Driver:</strong> Must be approved by admin, OTP sent to driver email
                  </span>
                </div>
                <div className="flex items-center gap-2 p-2.5 bg-slate-50 border border-slate-200 rounded-lg">
                  <Users className="h-4 w-4 text-blue-600 shrink-0" />
                  <span className="text-[11px] text-slate-500">
                    <strong className="text-slate-700">Citizen:</strong> Direct login with password (no OTP)
                  </span>
                </div>
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="w-full py-3 bg-gradient-to-r from-emerald-600 to-teal-600 hover:from-emerald-700 hover:to-teal-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-emerald-900/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span>{submitting ? 'Verifying...' : 'Sign In'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>
            </form>
          ) : (
            /* STEP 2: Enter 6-digit OTP */
            <form onSubmit={handleVerifyOtp} className="space-y-4">
              <div className="p-3.5 bg-slate-50 border border-slate-200 rounded-xl text-center space-y-1">
                <div className="inline-flex items-center justify-center w-8 h-8 rounded-full bg-teal-100 text-teal-700 mb-1">
                  <Mail className="h-4 w-4" />
                </div>
                <div className="text-xs font-bold text-slate-800">
                  Enter 6-Digit Verification Code
                </div>
                <div className="text-[11px] text-slate-500">
                  Sent to <span className="font-semibold text-teal-700">{maskedEmail}</span>
                </div>
                {targetRole && (
                  <div className="text-[10px] uppercase tracking-wider font-bold text-teal-600">
                    {targetRole} Role Authentication
                  </div>
                )}
              </div>

              <div>
                <label className="block text-center text-xs font-semibold text-slate-600 uppercase tracking-wider mb-2">
                  One-Time Password (OTP)
                </label>
                <input
                  type="text"
                  maxLength="6"
                  pattern="[0-9]{6}"
                  value={otp}
                  onChange={(e) => setOtp(e.target.value.replace(/\D/g, ''))}
                  placeholder="000000"
                  autoFocus
                  className="w-full px-4 py-3 bg-slate-50 border-2 border-slate-300 rounded-xl text-center text-2xl font-mono font-bold tracking-[10px] focus:bg-white focus:border-teal-600 focus:ring-4 focus:ring-teal-600/15 outline-none transition-all placeholder:tracking-normal"
                  required
                />
              </div>

              <button
                type="submit"
                disabled={submitting || otp.trim().length !== 6}
                className="w-full py-3 bg-gradient-to-r from-teal-600 to-emerald-600 hover:from-teal-700 hover:to-emerald-700 text-white font-bold rounded-xl text-sm shadow-lg shadow-teal-900/20 flex items-center justify-center gap-2 transition-all disabled:opacity-50 cursor-pointer"
              >
                <span>{submitting ? 'Verifying OTP...' : 'Confirm & Access Portal'}</span>
                <ArrowRight className="h-4 w-4" />
              </button>

              <div className="flex items-center justify-between text-xs pt-2">
                <button
                  type="button"
                  onClick={handleBackToCredentials}
                  className="text-slate-500 hover:text-slate-800 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <ArrowLeft className="h-3.5 w-3.5" /> Change Email
                </button>

                <button
                  type="button"
                  onClick={handleResendOtp}
                  disabled={resendCooldown > 0 || submitting}
                  className="text-teal-600 hover:text-teal-700 font-semibold disabled:text-slate-400 flex items-center gap-1 cursor-pointer transition-colors"
                >
                  <RefreshCw className={`h-3 w-3 ${submitting ? 'animate-spin' : ''}`} />
                  {resendCooldown > 0 ? `Resend code in ${resendCooldown}s` : 'Resend OTP'}
                </button>
              </div>
            </form>
          )}

          <div className="text-center pt-2 space-y-1.5 border-t border-slate-100">
            <p className="text-xs text-slate-500">
              New citizen user?{' '}
              <Link to="/register" className="font-semibold text-emerald-600 hover:underline">
                Create an account
              </Link>
            </p>
            <p className="text-[11px] text-slate-400">
              Admin & Driver logins require OTP verification for security.
            </p>
          </div>
        </div>
      </div>
    </div>
  );
}
