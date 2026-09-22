import React, { useCallback, useEffect, useState } from 'react';
import { useParams, useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { INDIAN_STATES, SEASONS, CROP_TYPES, LOSS_REASONS } from '../../utils/constants';
import PageHeader from '../../components/ui/PageHeader';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { TextField, SelectField, TextAreaField } from '../../components/ui/Field';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { ArrowLeft, ArrowRight, MapPin, Sprout, Camera, CheckCircle2, Loader2, AlertTriangle } from 'lucide-react';

const STEPS = [
  { id: 1, label: 'Location', icon: MapPin },
  { id: 2, label: 'Damage', icon: Sprout },
  { id: 3, label: 'Review', icon: CheckCircle2 },
];

const MIN_DESCRIPTION = 10;

export default function SubmitClaim() {
  const { insuranceId } = useParams();
  const navigate = useNavigate();
  const [step, setStep] = useState(1);
  const [policy, setPolicy] = useState(null);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');
  const [confirmOpen, setConfirmOpen] = useState(false);

  const [form, setForm] = useState({
    state: '',
    season: '',
    farmArea: '',
    insuranceNumber: '',
    cropType: '',
    lossReason: '',
    lossDescription: '',
  });
  const [fieldErrors, setFieldErrors] = useState({});

  const fetchPolicy = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const { data } = await api.get(`/api/insurance/${insuranceId}`);
      setPolicy(data.insurance || data.policy || data);
    } catch (err) {
      setLoadError(err.response?.data?.error || 'We could not find that policy. It may have been withdrawn.');
    } finally {
      setLoading(false);
    }
  }, [insuranceId]);

  useEffect(() => {
    fetchPolicy();
  }, [fetchPolicy]);

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFieldErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validateStep = (s) => {
    const errs = {};
    if (s === 1) {
      if (!form.state) errs.state = 'Choose the state your farm is in';
      if (!form.season) errs.season = 'Choose the growing season';
      const area = parseFloat(form.farmArea);
      if (!form.farmArea) errs.farmArea = 'Enter your farm area in acres';
      else if (Number.isNaN(area) || area <= 0) errs.farmArea = 'Farm area must be more than 0 acres';
      else if (area > 10000) errs.farmArea = 'That area looks too large — check the number';
    }
    if (s === 2) {
      if (!form.cropType) errs.cropType = 'Choose the crop that was damaged';
      if (!form.lossReason) errs.lossReason = 'Choose what caused the damage';
      if (!form.lossDescription.trim()) errs.lossDescription = 'Describe what happened to your crop';
      else if (form.lossDescription.trim().length < MIN_DESCRIPTION)
        errs.lossDescription = `Please write at least ${MIN_DESCRIPTION} characters so the assessor understands the damage`;
    }
    setFieldErrors(errs);
    return Object.keys(errs).length === 0;
  };

  // The Next button used to be disabled until the step validated, which told
  // the farmer nothing about what was missing. It is always pressable now and
  // points at the fields that still need an answer.
  const goNext = () => {
    if (validateStep(step)) {
      setStep((s) => s + 1);
      window.scrollTo({ top: 0, behavior: 'smooth' });
    }
  };

  const goBack = () => {
    setStep((s) => s - 1);
    window.scrollTo({ top: 0, behavior: 'smooth' });
  };

  const handleSubmit = async () => {
    try {
      setSubmitting(true);
      setError('');
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
      const { data } = await api.post('/api/claims/initialize', payload);
      if (data.success) {
        setConfirmOpen(false);
        navigate(`/dashboard/media-capture/${data.claim.documentId}`);
      } else {
        setError(data.details ? data.details.join(', ') : data.error || 'We could not start your claim. Try again.');
        setConfirmOpen(false);
      }
    } catch (err) {
      setError(
        err.response?.data?.details
          ? err.response.data.details.join(', ')
          : err.response?.data?.error || 'We could not start your claim. Check your connection and try again.'
      );
      setConfirmOpen(false);
    } finally {
      setSubmitting(false);
    }
  };

  if (loading) return <LoadingState label="Loading policy…" />;
  if (loadError) {
    return (
      <ErrorState
        title="Policy unavailable"
        message={loadError}
        onRetry={() => navigate('/dashboard/policies')}
        retryLabel="Back to policies"
      />
    );
  }

  const reviewRows = [
    { label: 'Policy', value: policy?.name || '—' },
    { label: 'State', value: form.state },
    { label: 'Season', value: form.season },
    { label: 'Farm area', value: `${form.farmArea} acres` },
    { label: 'Policy number', value: form.insuranceNumber || 'Not provided' },
    { label: 'Crop', value: form.cropType },
    { label: 'Cause of loss', value: form.lossReason },
  ];

  return (
    <div className="page-shell max-w-3xl space-y-6">
      <PageHeader
        eyebrow={policy?.name || 'New claim'}
        title="File a claim"
        description="Three short steps, then you will photograph the damage."
        actions={
          <button
            type="button"
            onClick={() => navigate('/dashboard/policies')}
            className="btn btn-ghost btn-sm text-saddle"
          >
            <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Policies
          </button>
        }
      />

      {/* The step rail previously hid its labels below 640px (`hidden sm:inline`),
          leaving a phone user with three unlabelled numbers. */}
      <ol className="flex items-stretch gap-2" aria-label="Progress">
        {STEPS.map((s) => {
          const state = step === s.id ? 'current' : step > s.id ? 'done' : 'upcoming';
          return (
            <li key={s.id} className="flex-1">
              <div
                aria-current={state === 'current' ? 'step' : undefined}
                className={`flex h-full flex-col gap-1 rounded-md border-t-2 px-1 pt-2 ${
                  state === 'upcoming' ? 'border-bone' : 'border-honey-amber'
                }`}
              >
                <span className="flex items-center gap-1.5">
                  <s.icon
                    className={`h-4 w-4 shrink-0 ${state === 'upcoming' ? 'text-loam' : 'text-saddle'}`}
                    aria-hidden="true"
                  />
                  <span className="label-micro">Step {s.id}</span>
                </span>
                <span
                  className={`text-body ${state === 'current' ? 'font-medium text-ink' : 'text-bark'}`}
                >
                  {s.label}
                </span>
              </div>
            </li>
          );
        })}
      </ol>

      {error && (
        <p
          role="alert"
          className="flex items-start gap-2 rounded-md border border-saddle bg-saddle/10 px-4 py-3 text-body text-saddle"
        >
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          {error}
        </p>
      )}

      <div className="rounded-lg border border-bone bg-pure-white p-5 sm:p-6">
        {step === 1 && (
          <div className="space-y-5">
            <div>
              <p className="eyebrow">Where is the farm</p>
              <h2 className="mt-1 text-subheading text-ink">Location and policy</h2>
            </div>
            <SelectField
              label="State"
              required
              value={form.state}
              onChange={(v) => set('state', v)}
              options={INDIAN_STATES}
              placeholder="Select state"
              error={fieldErrors.state}
            />
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Season"
                required
                value={form.season}
                onChange={(v) => set('season', v)}
                options={SEASONS}
                placeholder="Select season"
                error={fieldErrors.season}
              />
              <TextField
                label="Farm area (acres)"
                required
                type="number"
                inputMode="decimal"
                min="0"
                step="0.1"
                placeholder="e.g. 5"
                value={form.farmArea}
                onChange={(v) => set('farmArea', v)}
                error={fieldErrors.farmArea}
              />
            </div>
            <TextField
              label="Policy number"
              placeholder="Printed on your policy document"
              hint="Optional — leave blank if you do not have it to hand."
              value={form.insuranceNumber}
              onChange={(v) => set('insuranceNumber', v)}
            />
          </div>
        )}

        {step === 2 && (
          <div className="space-y-5">
            <div>
              <p className="eyebrow">What happened</p>
              <h2 className="mt-1 text-subheading text-ink">Crop and damage</h2>
            </div>
            <div className="grid gap-5 sm:grid-cols-2">
              <SelectField
                label="Crop"
                required
                value={form.cropType}
                onChange={(v) => set('cropType', v)}
                options={CROP_TYPES}
                placeholder="Select crop"
                error={fieldErrors.cropType}
              />
              <SelectField
                label="Cause of loss"
                required
                value={form.lossReason}
                onChange={(v) => set('lossReason', v)}
                options={LOSS_REASONS.map((r) => ({ value: r, label: r.charAt(0).toUpperCase() + r.slice(1) }))}
                placeholder="Select cause"
                error={fieldErrors.lossReason}
              />
            </div>
            <TextAreaField
              label="Describe the damage"
              required
              rows={5}
              value={form.lossDescription}
              onChange={(v) => set('lossDescription', v)}
              error={fieldErrors.lossDescription}
              hint={
                form.lossDescription.trim().length >= MIN_DESCRIPTION
                  ? `${form.lossDescription.trim().length} characters`
                  : `What happened, when, and how much of the field is affected. At least ${MIN_DESCRIPTION} characters.`
              }
              placeholder="For example: heavy hail on 12 August flattened roughly half the field near the north boundary."
            />
          </div>
        )}

        {step === 3 && (
          <div className="space-y-5">
            <div>
              <p className="eyebrow">Last look</p>
              <h2 className="mt-1 text-subheading text-ink">Review your claim</h2>
              <p className="mt-1 text-body text-bark">
                Check these details. You will photograph the damage in the next step.
              </p>
            </div>

            <dl className="divide-y divide-bone rounded-lg border border-bone bg-parchment px-4">
              {reviewRows.map((r) => (
                <div key={r.label} className="flex flex-wrap items-baseline justify-between gap-2 py-3">
                  <dt className="label-micro">{r.label}</dt>
                  <dd className="text-right text-body font-medium capitalize text-ink">{r.value}</dd>
                </div>
              ))}
              <div className="py-3">
                <dt className="label-micro">Description</dt>
                <dd className="mt-1 text-body text-ink">{form.lossDescription}</dd>
              </div>
            </dl>

            <p className="flex items-start gap-2 rounded-md border border-bone bg-parchment px-4 py-3 text-body text-saddle">
              <Camera className="mt-0.5 h-4 w-4 shrink-0 text-bark" aria-hidden="true" />
              Next you will take GPS-tagged photos of your field and the damage. Have your phone with you in the
              field before you continue.
            </p>
          </div>
        )}

        <div className="mt-6 flex items-center justify-between gap-3 border-t border-bone pt-5">
          {step > 1 ? (
            <button type="button" onClick={goBack} className="btn btn-outline">
              <ArrowLeft className="h-4 w-4" aria-hidden="true" /> Back
            </button>
          ) : (
            <span />
          )}

          {step < 3 ? (
            <button type="button" onClick={goNext} className="btn btn-primary">
              Continue <ArrowRight className="h-4 w-4" aria-hidden="true" />
            </button>
          ) : (
            <button type="button" onClick={() => setConfirmOpen(true)} disabled={submitting} className="btn btn-primary">
              {submitting ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" />
              )}
              Submit claim
            </button>
          )}
        </div>
      </div>

      {/* Submitting opens a claim record against a real policy, so it now asks
          first and shows exactly what is being filed. */}
      <ConfirmDialog
        open={confirmOpen}
        busy={submitting}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={handleSubmit}
        title="Submit this claim?"
        description="This opens a claim on your policy and takes you to photo capture. You can still add photos afterwards, but the claim details above are recorded now."
        summary={[
          { label: 'Policy', value: policy?.name || '—' },
          { label: 'Crop', value: form.cropType },
          { label: 'Area', value: `${form.farmArea} acres` },
          { label: 'Cause', value: form.lossReason },
        ]}
        confirmLabel="Submit and capture photos"
      />
    </div>
  );
}
