import React, { useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { ShieldCheck, Phone, KeyRound, ArrowLeft, Loader2, CheckCircle2 } from 'lucide-react';

export default function Login() {
  const navigate = useNavigate();
  const { login, isAuthenticated, user } = useAuth();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');

  if (isAuthenticated) {
    navigate(user?.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
    return null;
  }

  const handleSendOtp = async (e) => {
    e.preventDefault();
    if (!/^[6-9]\d{9}$/.test(phone)) return setError('Enter a valid 10-digit Indian mobile number');
    try {
      setLoading(true); setError('');
      await api.post('/api/auth/send-otp', { phoneNumber: phone });
      setStep('otp');
    } catch (err) {
      setError(err.response?.data?.error || 'Failed to send OTP');
    } finally { setLoading(false); }
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) return setError('Enter the OTP');
    try {
      setLoading(true); setError('');
      const { data } = await api.post('/api/auth/verify-otp', { phoneNumber: phone, otp });
      if (data.success && data.token) {
        login(data.token, data.user);
        navigate(data.user?.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
      } else {
        setError('Invalid OTP');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed');
    } finally { setLoading(false); }
  };

  return (
    <div className="min-h-screen flex bg-base-200">
      {/* Left panel — hero image (desktop only) */}
      <div className="hidden lg:flex lg:w-1/2 relative">
        <img src="/images/farmland-hero.jpeg" alt="Indian farmland" className="w-full h-full object-cover" />
        <div className="absolute inset-0 bg-gradient-to-r from-black/70 via-black/50 to-black/70" />
        <div className="absolute inset-0 flex flex-col justify-center px-12">
          <div className="flex items-center gap-3 mb-6">
            <img src="/images/government-emblem.png" alt="Emblem" className="w-12 h-12 object-contain opacity-90" />
            <div>
              <h1 className="text-2xl font-bold text-white">PBI AgriInsure</h1>
              <p className="text-sm text-white/60">Crop Insurance Platform</p>
            </div>
          </div>
          <h2 className="text-3xl font-bold text-white leading-snug mb-4">
            Protect Your Harvest with<br />AI-Powered Insurance
          </h2>
          <p className="text-white/60 mb-8 max-w-md">
            File crop damage claims instantly using your phone camera. Fast, fair, and transparent payouts for Indian farmers.
          </p>
          <div className="space-y-3">
            {['No paperwork required', 'AI-verified claims in minutes', 'Direct bank payouts'].map(t => (
              <div key={t} className="flex items-center gap-3 text-white/80">
                <CheckCircle2 className="w-5 h-5 text-green-400 shrink-0" />
                <span className="text-sm">{t}</span>
              </div>
            ))}
          </div>
        </div>
      </div>

      {/* Right panel — login form */}
      <div className="flex-1 flex items-center justify-center p-4 sm:p-8">
        <div className="card bg-base-100 shadow-xl w-full max-w-md">
          <div className="card-body">
            {/* Header */}
            <div className="text-center mb-4">
              <div className="w-16 h-16 bg-primary/10 rounded-2xl flex items-center justify-center mx-auto mb-4">
                <img
                  src="/images/government-emblem.png"
                  alt="PBI AgriInsure"
                  className="w-10 h-10 object-contain"
                  onError={(e) => { e.target.style.display = 'none'; e.target.nextSibling.style.display = 'flex'; }}
                />
                <div className="hidden items-center justify-center">
                  <ShieldCheck className="w-8 h-8 text-primary" />
                </div>
              </div>
              <h2 className="text-2xl font-bold text-base-content">
                {step === 'phone' ? 'Welcome Back' : 'Verify OTP'}
              </h2>
              <p className="text-sm text-base-content/60 mt-1">
                {step === 'phone'
                  ? 'Sign in to your PBI AgriInsure account'
                  : `We sent a code to +91 ${phone}`}
              </p>
            </div>

            {/* Error */}
            {error && (
              <div className="alert alert-error text-sm">
                <span>{error}</span>
              </div>
            )}

            {/* Phone step */}
            {step === 'phone' ? (
              <form onSubmit={handleSendOtp} className="space-y-4">
                <div className="form-control">
                  <label className="label"><span className="label-text">Mobile Number</span></label>
                  <label className="input input-bordered flex items-center gap-2">
                    <Phone className="w-4 h-4 text-base-content/40" />
                    <span className="text-base-content/50">+91</span>
                    <input
                      type="tel"
                      placeholder="Enter 10-digit number"
                      value={phone}
                      onChange={(e) => setPhone(e.target.value.replace(/\D/g, '').slice(0, 10))}
                      className="grow"
                      maxLength={10}
                      autoFocus
                    />
                  </label>
                </div>
                <button type="submit" disabled={loading || phone.length !== 10} className="btn btn-primary btn-block gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <KeyRound className="w-4 h-4" />}
                  {loading ? 'Sending...' : 'Send OTP'}
                </button>
              </form>
            ) : (
              <form onSubmit={handleVerifyOtp} className="space-y-4">
                <div className="form-control">
                  <label className="label"><span className="label-text">Enter OTP</span></label>
                  <label className="input input-bordered flex items-center gap-2">
                    <KeyRound className="w-4 h-4 text-base-content/40" />
                    <input
                      type="text"
                      placeholder="Enter OTP code"
                      value={otp}
                      onChange={(e) => setOtp(e.target.value.replace(/\D/g, '').slice(0, 6))}
                      className="grow"
                      maxLength={6}
                      autoFocus
                    />
                  </label>
                </div>
                <button type="submit" disabled={loading || !otp.trim()} className="btn btn-primary btn-block gap-2">
                  {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <ShieldCheck className="w-4 h-4" />}
                  {loading ? 'Verifying...' : 'Verify & Login'}
                </button>
                <button type="button" onClick={() => { setStep('phone'); setOtp(''); setError(''); }} className="btn btn-ghost btn-sm btn-block gap-2">
                  <ArrowLeft className="w-4 h-4" /> Change Number
                </button>
              </form>
            )}

            {/* Back to home */}
            <div className="divider text-xs text-base-content/40">OR</div>
            <button onClick={() => navigate('/')} className="btn btn-ghost btn-sm btn-block gap-2">
              <ArrowLeft className="w-4 h-4" /> Back to Home
            </button>
          </div>
        </div>
      </div>
    </div>
  );
}
