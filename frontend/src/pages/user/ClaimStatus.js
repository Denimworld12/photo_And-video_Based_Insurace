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

export default function ClaimStatus() {
  const navigate = useNavigate();
  const toast = useToast();
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [resubmitting, setResubmitting] = useState(null);
  const [confirmResubmit, setConfirmResubmit] = useState(null);

  const fetchClaims = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/claims/list', { params: { page, limit: 10 } });
      setClaims(data.claims || []);
      setPagination(data.pagination || { total: 0, pages: 1 });
    } catch (err) {
      setError(err.response?.data?.error || 'We could not load your claims. Check your connection and try again.');
      setClaims([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchClaims();
  }, [fetchClaims]);

  const handleResubmit = async (claim) => {
    try {
      setResubmitting(claim.documentId);
      const { data } = await api.post(`/api/claims/resubmit/${claim.documentId}`);
      const newId = data?.claim?.documentId;
      if (data.success && newId) {
        setConfirmResubmit(null);
        navigate(`/dashboard/media-capture/${newId}`);
      } else {
        // The old code did nothing at all on this branch, so a refused
        // resubmission looked exactly like a successful one.
        toast.error(data?.error || 'The claim could not be reopened. Contact the helpline if this continues.');
        setConfirmResubmit(null);
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'The claim could not be reopened. Try again in a moment.');
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
        const crop = (c.cropType || '').toLowerCase();
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

      {loading ? (
        <SkeletonList rows={3} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchClaims} />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={ClipboardList}
          title={query ? `Nothing matches “${search.trim()}”` : 'No claims yet'}
          message={
            query
              ? 'Try a shorter search, or clear it.'
              : 'File your first claim and it will appear here with its progress.'
          }
          action={
            query ? (
              <button type="button" onClick={() => setSearch('')} className="btn btn-outline">
                Clear search
              </button>
            ) : (
              <button type="button" onClick={() => navigate('/dashboard/policies')} className="btn btn-primary">
                <Plus className="h-4 w-4" aria-hidden="true" /> File a claim
              </button>
            )
          }
        />
      ) : (
        <>
          <ul className="space-y-3">
            {filtered.map((c) => {
              const isRejected = c.status === 'rejected';

              return (
                <li key={c.documentId} className="rounded-lg border border-bone bg-pure-white">
                  <button
                    type="button"
                    onClick={() => navigate(`/dashboard/claim-results/${c.documentId}`)}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-parchment"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-caption text-bark">{c.documentId}</span>
                      <span className="mt-0.5 block text-body-lg font-medium capitalize text-ink">
                        {c.cropType || 'Crop claim'}
                      </span>
                    </span>
                    <StatusBadge status={c.status} />
                  </button>

                  <dl className="grid grid-cols-2 gap-x-4 gap-y-3 border-t border-bone px-4 py-3 sm:grid-cols-4">
                    {[
                      { label: 'Crop', value: c.cropType || '—' },
                      { label: 'Cause of loss', value: c.lossReason || '—' },
                      { label: 'Area', value: c.farmArea ? `${c.farmArea} acres` : '—' },
                      { label: 'Filed', value: c.submittedAt ? fmt(c.submittedAt) : '—' },
                    ].map((d) => (
                      <div key={d.label}>
                        <dt className="label-micro">{d.label}</dt>
                        <dd className="text-body capitalize text-ink">{d.value}</dd>
                      </div>
                    ))}
                  </dl>

                  {c.confidenceScore > 0 && (
                    <div className="border-t border-bone px-4 py-3">
                      <Meter
                        label="AI confidence"
                        value={c.confidenceScore * 100}
                        caption={`${(c.confidenceScore * 100).toFixed(1)}%`}
                      />
                    </div>
                  )}

                  {c.payoutAmount > 0 && (
                    <p className="border-t border-bone px-4 py-3 text-body text-ink">
                      <span className="label-micro">Approved payout</span>
                      <span className="mt-0.5 block text-subheading font-medium text-deep-olive">
                        ₹{c.payoutAmount.toLocaleString('en-IN')}
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
            <Pagination page={page} totalPages={pagination.pages} onChange={setPage} total={pagination.total} />
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
                { label: 'Crop', value: confirmResubmit.cropType || '—' },
              ]
            : []
        }
        confirmLabel="Reopen and retake photos"
      />
    </div>
  );
}
