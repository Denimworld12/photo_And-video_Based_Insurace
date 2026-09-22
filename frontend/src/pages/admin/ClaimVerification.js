import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import { Meter } from '../../components/ui/StatTile';
import { TextField, TextAreaField } from '../../components/ui/Field';
import { ErrorState, EmptyState, SkeletonList } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import {
  ClipboardCheck, Search, Loader2, Eye, CheckCircle2, XCircle,
  MapPin, Camera, AlertTriangle, Banknote,
} from 'lucide-react';

const STATUS_FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'manual_review', label: 'Manual review' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'payout_pending', label: 'Payout pending' },
];

const NEEDS_REVIEW = ['submitted', 'processing', 'manual_review'];

export default function ClaimVerification() {
  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const [selected, setSelected] = useState(null);
  const [detailLoading, setDetailLoading] = useState(false);
  const [reviewing, setReviewing] = useState(false);
  const [confirmOpen, setConfirmOpen] = useState(false);
  const [reviewForm, setReviewForm] = useState({ status: '', payoutAmount: '', reviewNotes: '' });
  const [reviewErrors, setReviewErrors] = useState({});

  const fetchClaims = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const params = { page, limit: 15 };
      if (filter !== 'all') params.status = filter;
      if (appliedSearch) params.search = appliedSearch;
      const { data } = await api.get('/api/admin/claims', { params });
      if (!data.success) throw new Error(data.error || 'The claim list could not be read.');
      setClaims(data.claims || []);
      setPagination(data.pagination || { total: 0, pages: 1 });
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'The claim list could not be loaded.');
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [filter, page, appliedSearch]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const suggestedPayout = (claim) => {
    const calc = claim?.processingResult?.payout_calculation;
    return calc?.payout_amount ?? calc?.final_payout_amount ?? null;
  };

  const openDetail = async (id) => {
    try {
      setDetailLoading(true);
      const { data } = await api.get(`/api/admin/claims/${id}`);
      if (data.success) {
        setSelected(data.claim);
        // Pre-fill the amount the pipeline calculated, so approving at the
        // suggested figure is one click and any departure from it is deliberate.
        const suggested = suggestedPayout(data.claim);
        setReviewForm({ status: '', payoutAmount: suggested > 0 ? String(suggested) : '', reviewNotes: '' });
        setReviewErrors({});
      } else {
        toast.error('That claim could not be opened.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'That claim could not be opened.');
    } finally {
      setDetailLoading(false);
    }
  };

  const validateReview = () => {
    const errs = {};
    if (!reviewForm.status) errs.status = 'Choose approve or reject first';
    if (reviewForm.status === 'approved') {
      const amount = parseFloat(reviewForm.payoutAmount);
      // Approving used to omit a blank amount from the payload entirely, so a
      // claim could be approved for an unstated sum without any warning.
      if (!reviewForm.payoutAmount.trim()) errs.payoutAmount = 'Enter the amount to pay this farmer';
      else if (Number.isNaN(amount) || amount < 0) errs.payoutAmount = 'Enter a valid amount in rupees';
    }
    if (reviewForm.status === 'rejected' && !reviewForm.reviewNotes.trim())
      errs.reviewNotes = 'The farmer sees this reason and needs it to resubmit';
    setReviewErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const requestReview = () => {
    if (validateReview()) setConfirmOpen(true);
  };

  const submitReview = async () => {
    try {
      setReviewing(true);
      const payload = { status: reviewForm.status, reviewNotes: reviewForm.reviewNotes };
      if (reviewForm.status === 'approved') payload.payoutAmount = parseFloat(reviewForm.payoutAmount);

      const { data } = await api.patch(`/api/admin/claims/${selected._id}/review`, payload);
      if (data.success) {
        setClaims((prev) => prev.map((c) => (c._id === selected._id ? { ...c, status: reviewForm.status } : c)));
        const farmer = selected.userId?.fullName || selected.userId?.phoneNumber || 'the farmer';
        toast.success(
          reviewForm.status === 'approved'
            ? `Claim approved. ₹${parseFloat(reviewForm.payoutAmount).toLocaleString('en-IN')} queued for ${farmer}.`
            : `Claim rejected. ${farmer} has been told why and can resubmit.`
        );
        setConfirmOpen(false);
        setSelected(null);
      } else {
        toast.error(data.error || 'The decision was not saved. Nothing has changed.');
        setConfirmOpen(false);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'The decision was not saved. Nothing has changed.');
      setConfirmOpen(false);
    } finally {
      setReviewing(false);
    }
  };

  const fmt = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const needsReview = (status) => NEEDS_REVIEW.includes(status);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Claim verification"
        description="Review the AI assessment, then approve a payout or reject with a reason."
      />

      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 sm:max-w-md">
          <TextField
            label="Search claims"
            icon={Search}
            type="search"
            placeholder="Claim ID or crop"
            value={search}
            onChange={setSearch}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {appliedSearch && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setAppliedSearch('');
              setPage(1);
            }}
            className="btn btn-outline"
          >
            Clear
          </button>
        )}
      </form>

      <div
        role="group"
        aria-label="Filter by status"
        className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
      >
        {STATUS_FILTERS.map((f) => {
          const active = filter === f.key;
          return (
            <button
              key={f.key}
              type="button"
              aria-pressed={active}
              onClick={() => {
                setFilter(f.key);
                setPage(1);
              }}
              className={`shrink-0 rounded-md border px-3 py-1.5 text-body transition-colors ${
                active
                  ? 'border-honey-amber bg-honey-amber/25 font-medium text-ink'
                  : 'border-bone bg-pure-white text-saddle hover:border-loam'
              }`}
            >
              {f.label}
            </button>
          );
        })}
      </div>

      {loading ? (
        <SkeletonList rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchClaims} />
      ) : claims.length === 0 ? (
        <EmptyState
          icon={ClipboardCheck}
          title={appliedSearch ? `No claim matches “${appliedSearch}”` : 'No claims to show'}
          message={
            appliedSearch
              ? 'Try a claim ID, or clear the search.'
              : filter === 'all'
                ? 'Claims appear here as farmers file them.'
                : 'No claim currently has this status.'
          }
          action={
            filter !== 'all' && !appliedSearch ? (
              <button type="button" onClick={() => setFilter('all')} className="btn btn-outline">
                Show all claims
              </button>
            ) : null
          }
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-bone bg-pure-white">
          {/* Eight columns are unreadable below a laptop; the same record reads
              as a card on a phone and a tablet. */}
          <ul className="divide-y divide-bone xl:hidden">
            {claims.map((c) => (
              <li key={c._id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="font-mono text-caption text-bark">{c.documentId}</p>
                    <p className="mt-0.5 text-body-lg font-medium capitalize text-ink">{c.cropType || 'Crop claim'}</p>
                    <p className="text-body text-bark">
                      {c.user?.fullName || c.user?.phoneNumber || 'Unknown farmer'}
                    </p>
                  </div>
                  <StatusBadge status={c.status} />
                </div>
                <div className="flex items-center justify-between gap-3">
                  <span className="text-caption capitalize text-bark">
                    {c.lossReason || 'Cause not given'} · {fmt(c.submittedAt || c.createdAt)}
                  </span>
                  <button
                    type="button"
                    onClick={() => openDetail(c._id)}
                    className={needsReview(c.status) ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                  >
                    <Eye className="h-4 w-4" aria-hidden="true" /> {needsReview(c.status) ? 'Review' : 'View'}
                  </button>
                </div>
              </li>
            ))}
          </ul>

          <table className="hidden w-full xl:table">
            <thead>
              <tr className="border-b border-bone text-left">
                {['Claim ID', 'Farmer', 'Crop', 'Cause', 'Status', 'Filed', ''].map((h, i) => (
                  <th
                    key={h || i}
                    className="px-4 py-3 label-micro font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bone">
              {claims.map((c) => (
                <tr key={c._id} className="transition-colors hover:bg-parchment">
                  <td className="px-4 py-3 font-mono text-caption text-saddle">{c.documentId}</td>
                  <td className="px-4 py-3">
                    <p className="text-body text-ink">{c.user?.fullName || '—'}</p>
                    <p className="text-caption text-bark">{c.user?.phoneNumber || '—'}</p>
                  </td>
                  <td className="px-4 py-3 text-body capitalize text-ink">{c.cropType || '—'}</td>
                  <td className="px-4 py-3 text-body capitalize text-bark">{c.lossReason || '—'}</td>
                  <td className="px-4 py-3">
                    <StatusBadge status={c.status} />
                  </td>
                  <td className="px-4 py-3 text-caption text-bark">{fmt(c.submittedAt || c.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => openDetail(c._id)}
                      className={needsReview(c.status) ? 'btn btn-primary btn-sm' : 'btn btn-outline btn-sm'}
                    >
                      <Eye className="h-4 w-4" aria-hidden="true" /> {needsReview(c.status) ? 'Review' : 'View'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination page={page} totalPages={pagination.pages} onChange={setPage} total={pagination.total} />
        </div>
      )}

      {detailLoading && (
        <p role="status" className="flex items-center gap-2 text-body text-bark">
          <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Opening claim…
        </p>
      )}

      <Modal
        open={Boolean(selected)}
        onClose={() => setSelected(null)}
        title="Claim detail"
        subtitle={selected?.documentId}
        size="lg"
      >
        {selected && <ClaimDetail
          claim={selected}
          reviewForm={reviewForm}
          reviewErrors={reviewErrors}
          setReviewForm={setReviewForm}
          setReviewErrors={setReviewErrors}
          onSubmit={requestReview}
          reviewing={reviewing}
          needsReview={needsReview(selected.status)}
          suggested={suggestedPayout(selected)}
          fmt={fmt}
        />}
      </Modal>

      {/* Approving moves public money to a farmer and rejecting blocks it.
          Both used to fire straight from the form with no summary of the
          decision and no confirmation that it had been recorded. */}
      <ConfirmDialog
        open={confirmOpen}
        busy={reviewing}
        onCancel={() => setConfirmOpen(false)}
        onConfirm={submitReview}
        tone={reviewForm.status === 'rejected' ? 'danger' : 'primary'}
        title={reviewForm.status === 'approved' ? 'Approve this claim?' : 'Reject this claim?'}
        description={
          reviewForm.status === 'approved'
            ? 'The farmer is notified and the payout is queued for disbursement.'
            : 'The farmer is notified with the reason below and may resubmit with new evidence.'
        }
        summary={
          selected
            ? [
                { label: 'Claim', value: selected.documentId },
                {
                  label: 'Farmer',
                  value: selected.userId?.fullName || selected.userId?.phoneNumber || '—',
                },
                ...(reviewForm.status === 'approved'
                  ? [
                      {
                        label: 'Payout',
                        value: `₹${(parseFloat(reviewForm.payoutAmount) || 0).toLocaleString('en-IN')}`,
                      },
                    ]
                  : [{ label: 'Reason', value: reviewForm.reviewNotes }]),
              ]
            : []
        }
        confirmLabel={reviewForm.status === 'approved' ? 'Approve and queue payout' : 'Reject claim'}
      />
    </div>
  );
}

/** Kept at module scope so typing in the review notes does not remount the form. */
function ClaimDetail({
  claim,
  reviewForm,
  reviewErrors,
  setReviewForm,
  setReviewErrors,
  onSubmit,
  reviewing,
  needsReview,
  suggested,
  fmt,
}) {
  const confidence =
    (claim.confidenceScore || claim.processingResult?.overall_assessment?.confidence_score || 0) * 100;
  const damage =
    claim.processingResult?.damage_percentage ??
    claim.processingResult?.damage_assessment?.final_damage_percent;
  const aiDecision =
    claim.processingResult?.decision?.decision || claim.processingResult?.overall_assessment?.final_decision;
  const evidence = claim.uploadedImages || [];

  const setField = (key, value) => {
    setReviewForm((prev) => ({ ...prev, [key]: value }));
    setReviewErrors((prev) => ({ ...prev, [key]: '' }));
  };

  return (
    <div className="space-y-6">
      <dl className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        {[
          { label: 'Status', value: <StatusBadge status={claim.status} /> },
          { label: 'Farmer', value: claim.userId?.fullName || claim.userId?.phoneNumber || '—' },
          { label: 'Filed', value: fmt(claim.submittedAt || claim.createdAt) },
          { label: 'Attempt', value: claim.resubmissionCount ? `Resubmission #${claim.resubmissionCount}` : 'Original' },
        ].map((d) => (
          <div key={d.label} className="rounded-md border border-bone bg-parchment p-3">
            <dt className="label-micro">{d.label}</dt>
            <dd className="mt-1 text-body text-ink">{d.value}</dd>
          </div>
        ))}
      </dl>

      <section>
        <h3 className="eyebrow">Claim information</h3>
        <dl className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
          {[
            { label: 'Crop', value: claim.cropType },
            { label: 'Farm area', value: claim.farmArea ? `${claim.farmArea} acres` : null },
            { label: 'Cause of loss', value: claim.lossReason },
            { label: 'State', value: claim.state },
            { label: 'Season', value: claim.season },
            { label: 'Policy number', value: claim.insuranceNumber, mono: true },
          ].map((d) => (
            <div key={d.label}>
              <dt className="label-micro">{d.label}</dt>
              <dd className={`text-body capitalize text-ink ${d.mono ? 'font-mono' : ''}`}>{d.value || '—'}</dd>
            </div>
          ))}
        </dl>
        {claim.lossDescription && (
          <div className="mt-3">
            <p className="label-micro">Farmer's description</p>
            <p className="mt-1 rounded-md border border-bone bg-parchment p-3 text-body text-ink">
              {claim.lossDescription}
            </p>
          </div>
        )}
      </section>

      {claim.processingResult?.overall_assessment && (
        <section className="rounded-lg border border-bone bg-parchment p-4">
          <h3 className="eyebrow">AI assessment</h3>
          <div className="mt-3 grid gap-4 sm:grid-cols-2">
            <Meter label="Confidence" value={confidence} caption={`${confidence.toFixed(1)}%`} />
            {damage != null && <Meter label="Damage" value={damage} caption={`${damage.toFixed(1)}%`} />}
          </div>
          <dl className="mt-4 grid grid-cols-2 gap-3 border-t border-bone pt-3">
            <div>
              <dt className="label-micro">Recommendation</dt>
              <dd className="text-body font-medium text-ink">{aiDecision || 'None recorded'}</dd>
            </div>
            <div>
              <dt className="label-micro">Suggested payout</dt>
              <dd className="text-body font-medium text-ink">
                {suggested != null ? `₹${suggested.toLocaleString('en-IN')}` : '—'}
              </dd>
            </div>
          </dl>

          {claim.processingResult.verification_evidence && (
            <ul className="mt-3 flex flex-wrap gap-2 border-t border-bone pt-3">
              {[
                { label: 'Authenticity', ok: claim.processingResult.verification_evidence.authenticity_verified },
                { label: 'Location', ok: claim.processingResult.verification_evidence.location_verified },
                { label: 'Weather', ok: claim.processingResult.verification_evidence.weather_verified },
              ].map((v) => (
                <li
                  key={v.label}
                  className={`flex items-center gap-1.5 rounded-md border px-2 py-1 text-caption ${
                    v.ok ? 'border-sage bg-sage/15 text-deep-olive' : 'border-saddle bg-saddle/10 text-saddle'
                  }`}
                >
                  {v.ok ? (
                    <CheckCircle2 className="h-3 w-3" aria-hidden="true" />
                  ) : (
                    <XCircle className="h-3 w-3" aria-hidden="true" />
                  )}
                  {v.label} {v.ok ? 'verified' : 'not verified'}
                </li>
              ))}
            </ul>
          )}
        </section>
      )}

      {evidence.length > 0 && (
        <section>
          <h3 className="eyebrow">
            <Camera className="mr-1 inline h-3.5 w-3.5" aria-hidden="true" /> Evidence photos ({evidence.length})
          </h3>
          <ul className="mt-2 grid grid-cols-2 gap-3 sm:grid-cols-3">
            {evidence.map((img, i) => {
              const src = img.cloudinaryUrl || img.url;
              return (
                <li key={img._id || i} className="overflow-hidden rounded-md border border-bone bg-parchment">
                  <div className="aspect-video">
                    {src ? (
                      <img
                        src={src}
                        alt={`Evidence: ${img.stepId || `photo ${i + 1}`}`}
                        loading="lazy"
                        className="h-full w-full object-cover"
                      />
                    ) : (
                      <div className="flex h-full w-full items-center justify-center">
                        <Camera className="h-6 w-6 text-loam" aria-hidden="true" />
                      </div>
                    )}
                  </div>
                  <div className="border-t border-bone px-2 py-1.5">
                    <p className="truncate text-caption text-saddle">{img.stepId || `Photo ${i + 1}`}</p>
                    {img.coordinates?.lat != null && (
                      <p className="flex items-center gap-1 truncate text-caption text-bark">
                        <MapPin className="h-3 w-3 shrink-0" aria-hidden="true" />
                        {img.coordinates.lat.toFixed(4)}, {img.coordinates.lon.toFixed(4)}
                      </p>
                    )}
                  </div>
                </li>
              );
            })}
          </ul>
        </section>
      )}

      {claim.rejectionReason && claim.status !== 'rejected' && (
        <p className="flex items-start gap-2 rounded-md border border-honey-amber bg-honey-amber/20 px-3 py-2.5 text-body text-saddle">
          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0" aria-hidden="true" />
          <span>
            <span className="label-micro block text-saddle">Rejected previously</span>
            {claim.rejectionReason}
          </span>
        </p>
      )}

      {needsReview ? (
        <section className="border-t border-bone pt-5">
          <h3 className="text-subheading text-ink">Your decision</h3>

          <div role="radiogroup" aria-label="Decision" className="mt-3 grid grid-cols-2 gap-3">
            {[
              { value: 'approved', label: 'Approve', Icon: CheckCircle2 },
              { value: 'rejected', label: 'Reject', Icon: XCircle },
            ].map((opt) => {
              const active = reviewForm.status === opt.value;
              return (
                <button
                  key={opt.value}
                  type="button"
                  role="radio"
                  aria-checked={active}
                  onClick={() => setField('status', opt.value)}
                  className={`flex items-center justify-center gap-2 rounded-md border px-4 py-3 text-body font-medium transition-colors ${
                    active
                      ? 'border-honey-amber bg-honey-amber/25 text-ink'
                      : 'border-loam bg-pure-white text-saddle hover:border-bark'
                  }`}
                >
                  <opt.Icon className="h-5 w-5" aria-hidden="true" /> {opt.label}
                </button>
              );
            })}
          </div>
          {reviewErrors.status && (
            <p role="alert" className="mt-2 text-caption text-saddle">
              {reviewErrors.status}
            </p>
          )}

          {reviewForm.status === 'approved' && (
            <div className="mt-4">
              <TextField
                label="Payout amount (₹)"
                required
                type="number"
                inputMode="decimal"
                min="0"
                icon={Banknote}
                value={reviewForm.payoutAmount}
                onChange={(v) => setField('payoutAmount', v)}
                error={reviewErrors.payoutAmount}
                hint={
                  suggested != null
                    ? `The pipeline calculated ₹${suggested.toLocaleString('en-IN')}. Change it if your review says otherwise.`
                    : 'No amount was calculated for this claim — enter the figure you are authorising.'
                }
              />
            </div>
          )}

          <div className="mt-4">
            <TextAreaField
              label={reviewForm.status === 'rejected' ? 'Reason for rejection' : 'Review notes'}
              required={reviewForm.status === 'rejected'}
              rows={3}
              value={reviewForm.reviewNotes}
              onChange={(v) => setField('reviewNotes', v)}
              error={reviewErrors.reviewNotes}
              hint={
                reviewForm.status === 'rejected'
                  ? 'The farmer reads this word for word and uses it to fix their resubmission.'
                  : 'Kept on the claim record for audit.'
              }
              placeholder={
                reviewForm.status === 'rejected'
                  ? 'e.g. The corner photos do not show the field described, and no GPS was attached.'
                  : 'Anything a later reviewer should know.'
              }
            />
          </div>

          <button type="button" onClick={onSubmit} disabled={reviewing} className="btn btn-primary mt-5 w-full">
            {reviewing && <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />}
            {reviewForm.status === 'approved'
              ? 'Review approval'
              : reviewForm.status === 'rejected'
                ? 'Review rejection'
                : 'Choose approve or reject'}
          </button>
        </section>
      ) : (
        <section className="border-t border-bone pt-5">
          {claim.status === 'approved' && (
            <div className="rounded-md border border-sage bg-sage/10 px-4 py-3">
              <p className="flex items-center gap-2 text-body font-medium text-deep-olive">
                <CheckCircle2 className="h-4 w-4" aria-hidden="true" /> Approved
              </p>
              {claim.payoutAmount > 0 && (
                <p className="mt-1 text-body text-ink">
                  Payout ₹{claim.payoutAmount.toLocaleString('en-IN')}
                </p>
              )}
              {claim.reviewNotes && <p className="mt-1 text-body text-saddle">{claim.reviewNotes}</p>}
            </div>
          )}
          {claim.status === 'rejected' && (
            <div className="rounded-md border border-saddle bg-saddle/10 px-4 py-3">
              <p className="flex items-center gap-2 text-body font-medium text-saddle">
                <XCircle className="h-4 w-4" aria-hidden="true" /> Rejected
              </p>
              <p className="mt-1 text-body text-saddle">
                {claim.rejectionReason || claim.reviewNotes || 'No reason was recorded.'}
              </p>
            </div>
          )}
        </section>
      )}
    </div>
  );
}
