import React, { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { TextField } from '../../components/ui/Field';
import { ShieldCheck, Phone, KeyRound, ArrowLeft, Loader2, CheckCircle2, AlertTriangle } from 'lucide-react';

const RESEND_SECONDS = 30;

export default function Login() {
  const navigate = useNavigate();
  const { login } = useAuth();
  const [step, setStep] = useState('phone');
  const [phone, setPhone] = useState('');
  const [otp, setOtp] = useState('');
  const [loading, setLoading] = useState(false);
  const [error, setError] = useState('');
  const [notice, setNotice] = useState('');
  const [resendIn, setResendIn] = useState(0);

  // A farmer who never receives the SMS previously had no way forward at all:
  // there was no resend, and no indication of when one might be possible.
  useEffect(() => {
    if (resendIn <= 0) return undefined;
    const timer = setTimeout(() => setResendIn((s) => s - 1), 1000);
    return () => clearTimeout(timer);
  }, [resendIn]);

  const sendOtp = async ({ resend = false } = {}) => {
    if (!/^[6-9]\d{9}$/.test(phone)) {
      setError('Enter a valid 10-digit Indian mobile number');
      return;
    }
    try {
      setLoading(true);
      setError('');
      await api.post('/api/auth/send-otp', { phoneNumber: phone });
      setStep('otp');
      setResendIn(RESEND_SECONDS);
      setNotice(resend ? 'A new code is on its way.' : '');
    } catch (err) {
      setError(err.response?.data?.error || 'Could not send the code. Check your number and try again.');
    } finally {
      setLoading(false);
    }
  };

  const handleSendOtp = (e) => {
    e.preventDefault();
    sendOtp();
  };

  const handleVerifyOtp = async (e) => {
    e.preventDefault();
    if (!otp.trim()) {
      setError('Enter the code we sent you');
      return;
    }
    try {
      setLoading(true);
      setError('');
      const { data } = await api.post('/api/auth/verify-otp', { phoneNumber: phone, otp });
      if (data.success && data.token) {
        login(data.token, data.user);
        navigate(data.user?.role === 'admin' ? '/admin' : '/dashboard', { replace: true });
      } else {
        setError('That code was not correct. Check it and try again.');
      }
    } catch (err) {
      setError(err.response?.data?.error || 'Verification failed. Request a new code and try again.');
    } finally {
      setLoading(false);
    }
  };

  const promises = ['No paperwork required', 'AI-verified claims in minutes', 'Direct bank payouts'];

  return (
    <div className="flex min-h-screen bg-parchment">
      {/* Inverted panel — the theme's high-emphasis surface, used here to hold
          the brand promise without competing with the form. */}
      <aside className="relative hidden w-1/2 flex-col justify-center bg-charcoal-olive px-12 lg:flex">
        <img
          src="/images/farmland-hero.jpeg"
          alt=""
          className="absolute inset-0 h-full w-full object-cover opacity-20"
        />
        <div className="relative">
          <div className="mb-8 flex items-center gap-3">
            <img src="/images/government-emblem.png" alt="" className="h-11 w-11 object-contain" />
            <div>
              <p className="text-body-lg font-medium text-parchment">PBI AgriInsure</p>
              <p className="eyebrow text-loam">Crop Insurance Platform</p>
            </div>
          </div>
          <h1 className="max-w-md text-heading text-parchment">Protect your harvest with AI-verified insurance</h1>
          <p className="mt-4 max-w-md text-body-lg text-loam">
            File crop damage claims from your phone camera. Fast, fair and transparent payouts for Indian farmers.
          </p>
          <ul className="mt-8 space-y-3">
            {promises.map((t) => (
              <li key={t} className="flex items-center gap-3 text-body text-parchment">
                <CheckCircle2 className="h-5 w-5 shrink-0 text-honey-amber" aria-hidden="true" />
                {t}
              </li>
            ))}
          </ul>
        </div>
      </aside>

      <main className="flex flex-1 items-center justify-center px-4 py-10 sm:px-8">
        <div className="w-full max-w-md rounded-lg border border-bone bg-pure-white p-6 sm:p-8">
          <div className="flex flex-col items-center text-center">
            <div className="flex h-14 w-14 items-center justify-center rounded-lg bg-honey-amber/25">
              <img
                src="/images/government-emblem.png"
                alt=""
                className="h-9 w-9 object-contain"
                onError={(e) => {
                  e.currentTarget.style.display = 'none';
                }}
              />
            </div>
            <p className="eyebrow mt-5">{step === 'phone' ? 'Sign in' : 'Verify'}</p>
            <h1 className="mt-1 text-heading-sm text-ink">
              {step === 'phone' ? 'Welcome back' : 'Enter your code'}
            </h1>
            <p className="mt-1 text-body text-bark">
              {step === 'phone'
                ? 'We will text a one-time code to your mobile number.'
                : `Sent to +91 ${phone}`}
            </p>
          </div>

          {error && (
            <p
              role="alert"
              className="mt-5 flex items-start gap-2 rounded-md border border-saddle bg-saddle/10 px-3 py-2.5 text-body text-saddle"
            >
              <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
              {error}
            </p>
          )}
          {!error && notice && (
            <p role="status" className="mt-5 rounded-md border border-sage bg-sage/10 px-3 py-2.5 text-body text-deep-olive">
              {notice}
            </p>
          )}

          {step === 'phone' ? (
            <form onSubmit={handleSendOtp} className="mt-6 space-y-5">
              <TextField
                label="Mobile number"
                type="tel"
                inputMode="numeric"
                autoComplete="tel-national"
                icon={Phone}
                prefix="+91"
                placeholder="10-digit number"
                value={phone}
                maxLength={10}
                autoFocus
                hint="The number registered with your insurance policy."
                onChange={(v) => {
                  setPhone(v.replace(/\D/g, '').slice(0, 10));
                  setError('');
                }}
              />
              <button type="submit" disabled={loading || phone.length !== 10} className="btn btn-primary w-full">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <KeyRound className="h-4 w-4" aria-hidden="true" />
                )}
                {loading ? 'Sending code…' : 'Send code'}
              </button>
            </form>
          ) : (
            <form onSubmit={handleVerifyOtp} className="mt-6 space-y-5">
              <TextField
                label="One-time code"
                type="text"
                inputMode="numeric"
                autoComplete="one-time-code"
                icon={KeyRound}
                placeholder="6-digit code"
                value={otp}
                maxLength={6}
                autoFocus
                onChange={(v) => {
                  setOtp(v.replace(/\D/g, '').slice(0, 6));
                  setError('');
                }}
              />
              <button type="submit" disabled={loading || !otp.trim()} className="btn btn-primary w-full">
                {loading ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <ShieldCheck className="h-4 w-4" aria-hidden="true" />
                )}
                {loading ? 'Verifying…' : 'Verify and sign in'}
              </button>

              <div className="flex items-center justify-between gap-3">
                <button
                  type="button"
                  onClick={() => {
                    setStep('phone');
                    setOtp('');
                    setError('');
                    setNotice('');
                  }}
                  className="btn btn-ghost btn-sm text-saddle"
                >
                  <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Change number
                </button>
                <button
                  type="button"
                  onClick={() => sendOtp({ resend: true })}
                  disabled={resendIn > 0 || loading}
                  className="btn btn-ghost btn-sm text-saddle"
                >
                  {resendIn > 0 ? `Resend in ${resendIn}s` : 'Resend code'}
                </button>
              </div>
            </form>
          )}

          <div className="mt-6 border-t border-bone pt-4 text-center">
            <button type="button" onClick={() => navigate('/')} className="btn btn-ghost btn-sm text-bark">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back to home
            </button>
          </div>
        </div>
      </main>
    </div>
  );
}
