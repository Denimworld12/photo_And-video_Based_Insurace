import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import StatusBadge from '../../components/ui/StatusBadge';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { Meter } from '../../components/ui/StatTile';
import { TextField } from '../../components/ui/Field';
import { ErrorState, EmptyState, SkeletonList } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { ClipboardList, Search, Plus, RefreshCw, Loader2, AlertTriangle } from 'lucide-react';

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'processing', label: 'Processing' },
  { key: 'manual_review', label: 'Under review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'payout-complete', label: 'Paid' },
];

export default function ClaimStatus() {
  const navigate = useNavigate();
  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [resubmitting, setResubmitting] = useState(null);
  const [confirmResubmit, setConfirmResubmit] = useState(null);

  const fetchClaims = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/claims/list', {
        params: { filter: filter !== 'all' ? filter : undefined, page, limit: 10 },
      });
      setClaims(data.claims || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err.response?.data?.error || 'We could not load your claims. Check your connection and try again.');
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [filter, page]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const handleResubmit = async (claim) => {
    try {
      setResubmitting(claim.documentId);
      const { data } = await api.post(`/api/claims/resubmit/${claim.documentId}`);
      if (data.success && data.newDocumentId) {
        setConfirmResubmit(null);
        navigate(`/dashboard/media-capture/${data.newDocumentId}`);
      } else {
        // The old code did nothing at all on this branch, so a refused
        // resubmission looked exactly like a successful one.
        toast.error(data.message || 'The claim could not be reopened. Contact the helpline if this continues.');
        setConfirmResubmit(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.message || 'The claim could not be reopened. Try again in a moment.');
      setConfirmResubmit(null);
    } finally {
      setResubmitting(null);
    }
  };

  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  const query = search.trim().toLowerCase();
  const filtered = query
    ? claims.filter((c) => {
        const docId = (c.documentId || '').toLowerCase();
        const crop = (c.cropType || c.formData?.cropType || '').toLowerCase();
        return docId.includes(query) || crop.includes(query);
      })
    : claims;

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Claims"
        title="My claims"
        description="Every claim you have filed, with its assessment and payout."
        actions={
          <button type="button" onClick={() => navigate('/dashboard/policies')} className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> New claim
          </button>
        }
      />

      <div className="space-y-3">
        <div className="max-w-md">
          <TextField
            label="Search"
            icon={Search}
            type="search"
            placeholder="Claim ID or crop"
            value={search}
            onChange={setSearch}
          />
        </div>
        {/* Seven filter chips wrapped onto three lines on a phone. They now
            scroll horizontally on one line and stay above the fold. */}
        <div
          role="group"
          aria-label="Filter by status"
          className="-mx-4 flex gap-2 overflow-x-auto px-4 pb-1 sm:mx-0 sm:flex-wrap sm:px-0"
        >
          {FILTERS.map((f) => {
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
      </div>

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchClaims} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={
            query
              ? `Nothing matches “${search.trim()}”`
              : filter === 'all'
                ? 'No claims yet'
                : 'No claims with this status'
          }
          message={
            query
              ? 'Try a shorter search, or clear it.'
              : filter === 'all'
                ? 'File your first claim and it will appear here with its progress.'
                : 'Switch to “All” to see every claim you have filed.'
          }
          action={
            query ? (
              <button type="button" onClick={() => setSearch('')} className="btn btn-outline">
                Clear search
              </button>
            ) : filter === 'all' ? (
              <button type="button" onClick={() => navigate('/dashboard/policies')} className="btn btn-primary">
                <Plus className="h-4 w-4" aria-hidden="true" /> File a claim
              </button>
            ) : (
              <button type="button" onClick={() => setFilter('all')} className="btn btn-outline">
                Show all claims
              </button>
            )
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {filtered.map((c) => {
              const damage =
                c.processingResult?.phases?.damageAssessment?.percentage ?? c.processingResult?.damage_percentage;
              const isRejected = c.status === 'rejected';

              return (
                <li key={c._id || c.documentId} className="rounded-lg border border-bone bg-pure-white">
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/claim-results/${c.documentId}`)}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-parchment"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-caption text-bark">{c.documentId}</span>
                      <span className="mt-0.5 block text-body-lg font-medium capitalize text-ink">
                        {c.formData?.cropType || c.cropType || 'Crop claim'}
                      </span>
                      <span className="block text-caption text-bark">
                        {c.insuranceId?.name || 'Insurance policy'}
                      </span>
                    </span>
                    <StatusBadge status={c.status} />
                  </button>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-bone px-4 py-3 sm:grid-cols-4">
                    {[
                      { label: 'Crop', value: c.formData?.cropType || '—' },
                      { label: 'State', value: c.formData?.state || '—' },
                      { label: 'Area', value: c.formData?.farmArea ? `${c.formData.farmArea} acres` : '—' },
                      {
                        label: 'Filed',
                        value: c.submittedAt ? fmt(c.submittedAt) : c.createdAt ? fmt(c.createdAt) : '—',
                      },
                    ].map((d) => (
                      <div key={d.label}>
                        <dt className="label-micro">{d.label}</dt>
                        <dd className="text-body capitalize text-ink">{d.value}</dd>
                      </div>
                    ))}
                  </dl>

                  {(c.confidenceScore > 0 || damage != null) && (
                    <div className="grid gap-4 border-t border-bone px-4 py-3 sm:grid-cols-2">
                      {c.confidenceScore > 0 && (
                        <Meter
                          label="AI confidence"
                          value={c.confidenceScore * 100}
                          caption={`${(c.confidenceScore * 100).toFixed(1)}%`}
                        />
                      )}
                      {damage != null && <Meter label="Damage assessed" value={damage} caption={`${damage}%`} />}
                    </div>
                  )}

                  {c.financial?.approvedAmount > 0 && (
                    <p className="border-t border-bone px-4 py-3 text-body text-ink">
                      <span className="label-micro">Approved payout</span>
                      <span className="mt-0.5 block text-subheading font-medium text-deep-olive">
                        ₹{c.financial.approvedAmount.toLocaleString('en-IN')}
                      </span>
                    </p>
                  )}

                  {isRejected && (
                    <div className="space-y-3 border-t border-bone px-4 py-4">
                      {c.rejectionReason && (
                        <div className="flex items-start gap-2 rounded-md border border-saddle bg-saddle/10 px-3 py-2.5">
                          <AlertTriangle className="mt-0.5 h-4 w-4 shrink-0 text-saddle" aria-hidden="true" />
                          <p className="min-w-0 text-body text-saddle">
                            <span className="label-micro block text-saddle">Why it was rejected</span>
                            {c.rejectionReason}
                          </p>
                        </div>
                      )}
                      {c.resubmissionCount > 0 && (
                        <p className="text-caption text-bark">
                          Resubmitted {c.resubmissionCount} time{c.resubmissionCount === 1 ? '' : 's'} already.
                        </p>
                      )}
                      <button
                        type="button"
                        onClick={() => setConfirmResubmit(c)}
                        disabled={resubmitting === c.documentId}
                        className="btn btn-outline w-full"
                      >
                        {resubmitting === c.documentId ? (
                          <>
                            <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" /> Reopening…
                          </>
                        ) : (
                          <>
                            <RefreshCw className="h-4 w-4" aria-hidden="true" /> Resubmit with new photos
                          </>
                        )}
                      </button>
                    </div>
                  )}
                </li>
              );
            })}
          </ul>

          <div className="rounded-lg border border-bone bg-pure-white">
            <Pagination page={page} totalPages={totalPages} onChange={setPage} />
          </div>
        </>
      )}

      {/* window.confirm() before; the dialog now names the claim being reopened. */}
      <ConfirmDialog
        open={Boolean(confirmResubmit)}
        busy={resubmitting === confirmResubmit?.documentId}
        onCancel={() => setConfirmResubmit(null)}
        onConfirm={() => handleResubmit(confirmResubmit)}
        title="Resubmit this claim?"
        description="This opens a fresh claim from the rejected one and takes you back to photo capture. Read the rejection reason first so the new photos answer it."
        summary={
          confirmResubmit
            ? [
                { label: 'Claim', value: confirmResubmit.documentId },
                { label: 'Crop', value: confirmResubmit.formData?.cropType || '—' },
              ]
            : []
        }
        confirmLabel="Reopen and retake photos"
      />
    </div>
  );
}
