import React, { useState, useEffect } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import { useClaim } from '../../contexts/ClaimContext';
import api from '../../utils/api';
import { INDIAN_STATES, SEASONS, CROP_TYPES, LOSS_REASONS } from '../../utils/constants';
import { ArrowLeft, ArrowRight, MapPin, Sprout, Camera, CheckCircle2, Loader2 } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Location & Policy', icon: MapPin },
  { id: 2, label: 'Crop & Damage', icon: Sprout },
  { id: 3, label: 'Review & Submit', icon: CheckCircle2 },
];

export default function SubmitClaim() {
  const { insuranceId } = useParams();
  const navigate = useNavigate();
  const { generateDocumentId } = useClaim();
  const [step, setStep] = useState(1);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  const [form, setForm] = useState({
    state: '', season: '', farmArea: '', insuranceNumber: '',
    cropType: '', lossReason: '', lossDescription: '',
  });

  const [fieldErrors, setFieldErrors] = useState({});

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get(`/api/insurance/${insuranceId}`);
        setPolicy(data.insurance || data.policy || data);
      } catch { setError('Policy not found'); }
      finally { setLoading(false); }
    })();
  }, [insuranceId]);

  const set = (k, v) => {
    setForm((p) => ({ ...p, [k]: v }));
    setFieldErrors((p) => ({ ...p, [k]: '' }));
  };

  const validateStep = (s) => {
    const errs = {};
    if (s === 1) {
      if (!form.state) errs.state = 'State is required';
      if (!form.season) errs.season = 'Season is required';
      if (!form.farmArea) errs.farmArea = 'Farm area is required';
      else if (parseFloat(form.farmArea) <= 0) errs.farmArea = 'Farm area must be positive';
      else if (parseFloat(form.farmArea) > 10000) errs.farmArea = 'Farm area seems too large';
    }
    if (s === 2) {
      if (!form.cropType) errs.cropType = 'Crop type is required';
      if (!form.lossReason) errs.lossReason = 'Loss reason is required';
      if (!form.lossDescription) errs.lossDescription = 'Damage description is required';
      else if (form.lossDescription.trim().length < 10) errs.lossDescription = 'Please provide at least 10 characters';
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const canNext = () => {
    if (step === 1) return form.state && form.season && form.farmArea && parseFloat(form.farmArea) > 0;
    if (step === 2) return form.cropType && form.lossReason && form.lossDescription.trim().length >= 10;
    return true;
  };

  const goNext = () => {
    if (validateStep(step)) setStep(step + 1);
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true); setError('');
      const documentId = generateDocumentId();
      const payload = {
        insuranceId,
        formData: {
          state: form.state,
          season: form.season,
          scheme: '',
          cropType: form.cropType,
          farmArea: parseFloat(form.farmArea) || 0,
          lossReason: form.lossReason,
          lossDescription: form.lossDescription,
          insuranceNumber: form.insuranceNumber || '',
          year: new Date().getFullYear(),
        },
      };
      console.log('[SubmitClaim] Initializing claim:', JSON.stringify(payload, null, 2));
      const { data } = await api.post('/api/claims/initialize', payload);
      if (data.success) {
        console.log('[SubmitClaim] Claim initialized:', data.claim?.documentId);
        navigate(`/dashboard/media-capture/${data.claim?.documentId || documentId}`);
      } else {
        const errMsg = data.details ? data.details.join(', ') : (data.error || 'Submission failed');
        console.error('[SubmitClaim] API returned failure:', errMsg);
        setError(errMsg);
      }
    } catch (err) {
      const errMsg = err.response?.data?.details
        ? err.response.data.details.join(', ')
        : (err.response?.data?.error || 'Failed to submit claim. Please try again.');
      console.error('[SubmitClaim] Error:', err.response?.status, errMsg);
      setError(errMsg);
    } finally { setSubmitting(false); }
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-3xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-content">Submit Claim</h1>
          {policy && <p className="text-sm text-base-content/50 mt-0.5">Policy: {policy.name}</p>}
        </div>
        <button onClick={() => navigate('/dashboard/policies')} className="btn btn-ghost btn-sm gap-1">
          <ArrowLeft className="w-4 h-4" /> Back
        </button>
      </div>

      {/* Steps indicator */}
      <ul className="steps w-full">
        {STEPS.map((s) => (
          <li key={s.id} className={`step ${step >= s.id ? 'step-primary' : ''}`}>
            <span className="hidden sm:inline">{s.label}</span>
          </li>
        ))}
      </ul>

      {/* Error */}
      {error && (
        <div className="alert alert-error">
          <span>{error}</span>
        </div>
      )}

      {/* Form card */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          {/* Step 1: Location & Policy */}
          {step === 1 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <MapPin className="w-5 h-5 text-primary" /> Location & Policy Details
              </h3>
              <div className="form-control">
                <label className="label"><span className="label-text">State *</span></label>
                <select value={form.state} onChange={(e) => set('state', e.target.value)} className={`select select-bordered w-full ${fieldErrors.state ? 'select-error' : ''}`}>
                  <option value="">Select state</option>
                  {INDIAN_STATES.map((s) => <option key={s} value={s}>{s}</option>)}
                </select>
                {fieldErrors.state && <label className="label"><span className="label-text-alt text-error">{fieldErrors.state}</span></label>}
              </div>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label"><span className="label-text">Season *</span></label>
                  <select value={form.season} onChange={(e) => set('season', e.target.value)} className={`select select-bordered w-full ${fieldErrors.season ? 'select-error' : ''}`}>
                    <option value="">Select season</option>
                    {SEASONS.map((s) => <option key={s} value={s}>{s}</option>)}
                  </select>
                  {fieldErrors.season && <label className="label"><span className="label-text-alt text-error">{fieldErrors.season}</span></label>}
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Farm Area (acres) *</span></label>
                  <input type="number" value={form.farmArea} onChange={(e) => set('farmArea', e.target.value)} placeholder="e.g. 5" className={`input input-bordered w-full ${fieldErrors.farmArea ? 'input-error' : ''}`} min="0" step="0.1" />
                  {fieldErrors.farmArea && <label className="label"><span className="label-text-alt text-error">{fieldErrors.farmArea}</span></label>}
                </div>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Insurance Number (if available)</span></label>
                <input type="text" value={form.insuranceNumber} onChange={(e) => set('insuranceNumber', e.target.value)} placeholder="Enter policy number" className="input input-bordered w-full" />
              </div>
            </div>
          )}

          {/* Step 2: Crop & Damage */}
          {step === 2 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <Sprout className="w-5 h-5 text-primary" /> Crop & Damage Information
              </h3>
              <div className="grid grid-cols-1 sm:grid-cols-2 gap-4">
                <div className="form-control">
                  <label className="label"><span className="label-text">Crop Type *</span></label>
                  <select value={form.cropType} onChange={(e) => set('cropType', e.target.value)} className={`select select-bordered w-full ${fieldErrors.cropType ? 'select-error' : ''}`}>
                    <option value="">Select crop</option>
                    {CROP_TYPES.map((c) => <option key={c} value={c}>{c}</option>)}
                  </select>
                  {fieldErrors.cropType && <label className="label"><span className="label-text-alt text-error">{fieldErrors.cropType}</span></label>}
                </div>
                <div className="form-control">
                  <label className="label"><span className="label-text">Loss Reason *</span></label>
                  <select value={form.lossReason} onChange={(e) => set('lossReason', e.target.value)} className={`select select-bordered w-full ${fieldErrors.lossReason ? 'select-error' : ''}`}>
                    <option value="">Select reason</option>
                    {LOSS_REASONS.map((r) => <option key={r} value={r}>{r}</option>)}
                  </select>
                  {fieldErrors.lossReason && <label className="label"><span className="label-text-alt text-error">{fieldErrors.lossReason}</span></label>}
                </div>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Damage Description *</span></label>
                <textarea
                  value={form.lossDescription}
                  onChange={(e) => set('lossDescription', e.target.value)}
                  placeholder="Describe the damage in detail: what happened, when, how much area is affected..."
                  className={`textarea textarea-bordered w-full ${fieldErrors.lossDescription ? 'textarea-error' : ''}`}
                  rows={4}
                />
                <label className="label">
                  <span className={`label-text-alt ${fieldErrors.lossDescription ? 'text-error' : 'text-base-content/40'}`}>
                    {fieldErrors.lossDescription || `${form.lossDescription.trim().length}/10 min characters`}
                  </span>
                </label>
              </div>
            </div>
          )}

          {/* Step 3: Review */}
          {step === 3 && (
            <div className="space-y-4">
              <h3 className="text-lg font-semibold flex items-center gap-2">
                <CheckCircle2 className="w-5 h-5 text-primary" /> Review Your Claim
              </h3>
              <p className="text-sm text-base-content/60">Please review all details before submitting. You'll capture photos in the next step.</p>

              <div className="bg-base-200 rounded-xl p-5 space-y-3">
                {[
                  { label: 'Policy', value: policy?.name || '—' },
                  { label: 'State', value: form.state },
                  { label: 'Season', value: form.season },
                  { label: 'Farm Area', value: `${form.farmArea} acres` },
                  { label: 'Insurance No.', value: form.insuranceNumber || 'N/A' },
                  { label: 'Crop Type', value: form.cropType },
                  { label: 'Loss Reason', value: form.lossReason },
                  { label: 'Description', value: form.lossDescription },
                ].map((r) => (
                  <div key={r.label} className="flex justify-between text-sm">
                    <span className="text-base-content/60">{r.label}</span>
                    <span className="font-medium text-base-content max-w-[60%] text-right">{r.value}</span>
                  </div>
                ))}
              </div>

              <div className="alert alert-info">
                <Camera className="w-5 h-5" />
                <span>After submission, you'll be redirected to capture GPS-tagged photos of the damage.</span>
              </div>
            </div>
          )}

          {/* Navigation buttons */}
          <div className="flex justify-between mt-6 pt-4 border-t border-base-300">
            {step > 1 ? (
              <button onClick={() => setStep(step - 1)} className="btn btn-ghost gap-2">
                <ArrowLeft className="w-4 h-4" /> Previous
              </button>
            ) : <div />}

            {step < 3 ? (
              <button onClick={goNext} disabled={!canNext()} className="btn btn-primary gap-2">
                Next <ArrowRight className="w-4 h-4" />
              </button>
            ) : (
              <button onClick={handleSubmit} disabled={submitting} className="btn btn-primary gap-2">
                {submitting ? <Loader2 className="w-4 h-4 animate-spin" /> : <CheckCircle2 className="w-4 h-4" />}
                {submitting ? 'Submitting...' : 'Submit & Capture Photos'}
              </button>
            )}
          </div>
        </div>
      </div>
    </div>
  );
}
