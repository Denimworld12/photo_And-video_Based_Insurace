import React, { useState, useEffect, useCallback } from 'react';
import api from '../../utils/api';
import {
  ClipboardCheck, Search, Loader2, Eye, CheckCircle2, XCircle,
  X, ChevronLeft, ChevronRight, MapPin, Camera, AlertTriangle, Banknote
} from 'lucide-react';

const STATUS_FILTERS = [
  { key: 'all', label: 'All Claims' },
  { key: 'manual_review', label: 'Manual Review' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'payout_pending', label: 'Payout Pending' },
];

const statusBadge = (s) => ({
  approved: 'badge-success', rejected: 'badge-error', processing: 'badge-warning',
  submitted: 'badge-info', manual_review: 'badge-warning', 'manual-review': 'badge-warning',
  payout_pending: 'badge-accent', payout_complete: 'badge-success', draft: 'badge-ghost',
}[s] || 'badge-ghost');

export default function ClaimVerification() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });
  const [selected, setSelected] = useState(null);
  const [reviewing, setReviewing] = useState(false);
  const [reviewForm, setReviewForm] = useState({ status: '', payoutAmount: '', reviewNotes: '' });

  const fetchClaims = useCallback(async () => {
    try {
      setLoading(true);
      const params = { page, limit: 15 };
      if (filter !== 'all') params.status = filter;
      if (search) params.search = search;
      const { data } = await api.get('/api/admin/claims', { params });
      if (data.success) { setClaims(data.claims || []); setPagination(data.pagination || { total: 0, pages: 1 }); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  }, [filter, page, search]);

  useEffect(() => { fetchClaims(); }, [fetchClaims]);

  const handleSearchSubmit = (e) => { e.preventDefault(); setPage(1); fetchClaims(); };

  const openDetail = async (id) => {
    try {
      const { data } = await api.get(`/api/admin/claims/${id}`);
      if (data.success) { setSelected(data.claim); setReviewForm({ status: '', payoutAmount: '', reviewNotes: '' }); }
    } catch { alert('Failed to load claim detail'); }
  };

  const submitReview = async () => {
    if (!reviewForm.status) return alert('Select Approve or Reject');
    try {
      setReviewing(true);
      const payload = { status: reviewForm.status, reviewNotes: reviewForm.reviewNotes };
      if (reviewForm.status === 'approved' && reviewForm.payoutAmount) payload.payoutAmount = parseFloat(reviewForm.payoutAmount);
      const { data } = await api.patch(`/api/admin/claims/${selected._id}/review`, payload);
      if (data.success) {
        setClaims(prev => prev.map(c => c._id === selected._id ? { ...c, status: reviewForm.status } : c));
        setSelected(null);
      }
    } catch (err) { alert(err.response?.data?.error || 'Review failed'); }
    finally { setReviewing(false); }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';
  const getConfidence = (claim) => ((claim.confidenceScore || claim.processingResult?.overall_assessment?.confidence_score || 0) * 100).toFixed(1);
  const needsReview = (status) => ['submitted', 'processing', 'manual_review', 'manual-review'].includes(status);

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
          <ClipboardCheck className="w-6 h-6 text-secondary" /> Claim Verification
        </h1>
        <p className="text-sm text-base-content/50 mt-1">Review, approve or reject insurance claims</p>
      </div>

      {/* Search */}
      <form onSubmit={handleSearchSubmit} className="flex gap-3">
        <label className="input input-bordered flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-base-content/40" />
          <input type="text" className="grow" placeholder="Search by claim ID or crop type..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">Search</button>
      </form>

      {/* Filters */}
      <div className="flex flex-wrap gap-2">
        {STATUS_FILTERS.map(f => (
          <button key={f.key} onClick={() => { setFilter(f.key); setPage(1); }}
            className={`btn btn-sm ${filter === f.key ? 'btn-secondary' : 'btn-ghost bg-base-200'}`}>
            {f.label}
          </button>
        ))}
      </div>

      {/* Modal */}
      {selected && (
        <dialog className="modal modal-open">
          <div className="modal-box max-w-3xl max-h-[85vh] overflow-y-auto">
            <div className="flex items-center justify-between mb-4">
              <div>
                <h2 className="text-lg font-bold">Claim Detail</h2>
                <p className="text-xs text-base-content/40 font-mono">{selected.documentId}</p>
              </div>
              <button onClick={() => setSelected(null)} className="btn btn-ghost btn-sm btn-circle">
                <X className="w-4 h-4" />
              </button>
            </div>

            {/* Status grid */}
            <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 mb-6">
              {[
                { label: 'Status', value: <span className={`badge badge-sm ${statusBadge(selected.status)}`}>{(selected.status || '').replace(/_/g, ' ')}</span> },
                { label: 'Farmer', value: selected.userId?.fullName || selected.userId?.phoneNumber || '—' },
                { label: 'Submitted', value: fmt(selected.submittedAt || selected.createdAt) },
                { label: 'Resubmission', value: selected.resubmissionCount ? `#${selected.resubmissionCount}` : 'Original' },
              ].map(item => (
                <div key={item.label} className="bg-base-200 rounded-xl p-3">
                  <p className="text-xs text-base-content/40 mb-1">{item.label}</p>
                  <div className="text-sm font-medium">{item.value}</div>
                </div>
              ))}
            </div>

            {/* Claim Info */}
            <h3 className="font-semibold text-base-content mb-3 text-sm">Claim Information</h3>
            <div className="grid grid-cols-2 sm:grid-cols-3 gap-3 text-sm mb-4">
              {[
                { label: 'Crop Type', value: selected.cropType },
                { label: 'Farm Area', value: selected.farmArea ? `${selected.farmArea} acres` : '—' },
                { label: 'Loss Reason', value: selected.lossReason },
                { label: 'State', value: selected.state },
                { label: 'Season', value: selected.season },
                { label: 'Insurance No.', value: selected.insuranceNumber, mono: true },
              ].map(item => (
                <div key={item.label}>
                  <span className="text-base-content/40 text-xs block">{item.label}</span>
                  <span className={`font-medium ${item.mono ? 'font-mono text-xs' : ''}`}>{item.value || '—'}</span>
                </div>
              ))}
            </div>
            {selected.lossDescription && (
              <div className="mb-6">
                <span className="text-base-content/40 text-xs block mb-1">Loss Description</span>
                <p className="text-sm bg-base-200 p-3 rounded-lg">{selected.lossDescription}</p>
              </div>
            )}

            {/* AI Analysis */}
            {selected.processingResult && (
              <div className="bg-secondary/5 rounded-xl p-4 border border-secondary/20 mb-6">
                <h3 className="font-semibold text-secondary mb-3 text-sm flex items-center gap-2">
                  <Eye className="w-4 h-4" /> AI Analysis Result
                </h3>
                <div className="stats stats-vertical sm:stats-horizontal w-full bg-base-100">
                  <div className="stat py-2 px-3">
                    <div className="stat-title text-xs">Confidence</div>
                    <div className="stat-value text-lg text-secondary">
                      {((selected.confidenceScore || selected.processingResult?.overall_assessment?.confidence_score || 0) * 100).toFixed(1)}%
                    </div>
                  </div>
                  <div className="stat py-2 px-3">
                    <div className="stat-title text-xs">Damage</div>
                    <div className="stat-value text-lg">
                      {selected.processingResult?.damage_assessment?.final_damage_percent?.toFixed(1) || selected.processingResult?.overall_assessment?.damage_percentage?.toFixed(1) || '—'}%
                    </div>
                  </div>
                  <div className="stat py-2 px-3">
                    <div className="stat-title text-xs">AI Decision</div>
                    <div className={`stat-value text-lg ${
                      (selected.processingResult?.decision?.decision || selected.processingResult?.overall_assessment?.final_decision) === 'APPROVE' ? 'text-success' :
                      (selected.processingResult?.decision?.decision || selected.processingResult?.overall_assessment?.final_decision) === 'REJECT' ? 'text-error' : 'text-warning'
                    }`}>
                      {selected.processingResult?.decision?.decision || selected.processingResult?.overall_assessment?.final_decision || '—'}
                    </div>
                  </div>
                  <div className="stat py-2 px-3">
                    <div className="stat-title text-xs">Suggested Payout</div>
                    <div className="stat-value text-lg">
                      {selected.processingResult?.payout_calculation?.final_payout_amount
                        ? `₹${selected.processingResult.payout_calculation.final_payout_amount.toLocaleString('en-IN')}`
                        : '—'}
                    </div>
                  </div>
                </div>
                {selected.processingResult?.verification_evidence && (
                  <div className="mt-3 flex flex-wrap gap-2">
                    {[
                      { label: 'Authenticity', ok: selected.processingResult.verification_evidence.authenticity_verified },
                      { label: 'Location', ok: selected.processingResult.verification_evidence.location_verified },
                      { label: 'Weather', ok: selected.processingResult.verification_evidence.weather_verified },
                    ].map(v => (
                      <span key={v.label} className={`badge badge-sm gap-1 ${v.ok ? 'badge-success' : 'badge-error'}`}>
                        {v.ok ? <CheckCircle2 className="w-3 h-3" /> : <XCircle className="w-3 h-3" />} {v.label}
                      </span>
                    ))}
                  </div>
                )}
              </div>
            )}

            {/* Evidence Photos */}
            {selected.uploadedImages?.length > 0 && (
              <div className="mb-6">
                <h3 className="font-semibold text-base-content mb-3 text-sm flex items-center gap-2">
                  <Camera className="w-4 h-4" /> Evidence Photos ({selected.uploadedImages.length})
                </h3>
                <div className="grid grid-cols-2 sm:grid-cols-3 gap-3">
                  {selected.uploadedImages.map((img, i) => (
                    <div key={i} className="relative aspect-video bg-base-200 rounded-xl overflow-hidden border border-base-300">
                      {img.cloudinaryUrl ? (
                        <img src={img.cloudinaryUrl} alt={img.stepId || `Evidence ${i + 1}`} className="w-full h-full object-cover" />
                      ) : (
                        <div className="w-full h-full flex items-center justify-center text-base-content/30 text-sm">{img.stepId || `Image ${i + 1}`}</div>
                      )}
                      <div className="absolute bottom-0 inset-x-0 bg-gradient-to-t from-black/60 to-transparent p-2">
                        <p className="text-white text-xs font-medium">{img.stepId || `Step ${i + 1}`}</p>
                        {img.coordinates?.lat && (
                          <p className="text-white/70 text-[10px] flex items-center gap-0.5">
                            <MapPin className="w-2 h-2" />{img.coordinates.lat.toFixed(4)}, {img.coordinates.lon.toFixed(4)}
                          </p>
                        )}
                      </div>
                    </div>
                  ))}
                </div>
              </div>
            )}

            {/* Previous rejection */}
            {selected.rejectionReason && selected.status !== 'rejected' && (
              <div className="alert alert-warning mb-6">
                <AlertTriangle className="w-4 h-4" />
                <div><p className="font-bold text-xs">Previously Rejected</p><p className="text-sm">{selected.rejectionReason}</p></div>
              </div>
            )}

            {/* Review Form */}
            {needsReview(selected.status) && (
              <div className="border-t border-base-300 pt-5 space-y-4">
                <h3 className="font-semibold text-base-content">Admin Review Decision</h3>
                <div className="grid grid-cols-2 gap-3">
                  <button onClick={() => setReviewForm(p => ({ ...p, status: 'approved' }))}
                    className={`btn gap-2 ${reviewForm.status === 'approved' ? 'btn-success' : 'btn-outline btn-success'}`}>
                    <CheckCircle2 className="w-5 h-5" /> Approve
                  </button>
                  <button onClick={() => setReviewForm(p => ({ ...p, status: 'rejected' }))}
                    className={`btn gap-2 ${reviewForm.status === 'rejected' ? 'btn-error' : 'btn-outline btn-error'}`}>
                    <XCircle className="w-5 h-5" /> Reject
                  </button>
                </div>

                {reviewForm.status === 'approved' && (
                  <div className="form-control">
                    <label className="label"><span className="label-text">Payout Amount (₹)</span></label>
                    <label className="input input-bordered flex items-center gap-2">
                      <Banknote className="w-4 h-4 text-base-content/40" />
                      <input type="number" value={reviewForm.payoutAmount} onChange={e => setReviewForm(p => ({ ...p, payoutAmount: e.target.value }))} className="grow"
                        placeholder={selected.processingResult?.payout_calculation?.final_payout_amount
                          ? `Suggested: ₹${selected.processingResult.payout_calculation.final_payout_amount.toLocaleString('en-IN')}`
                          : 'Enter payout amount'} />
                    </label>
                  </div>
                )}

                <div className="form-control">
                  <label className="label">
                    <span className="label-text">{reviewForm.status === 'rejected' ? 'Rejection Reason (required)' : 'Review Notes'}</span>
                  </label>
                  <textarea value={reviewForm.reviewNotes} onChange={e => setReviewForm(p => ({ ...p, reviewNotes: e.target.value }))}
                    className="textarea textarea-bordered" rows="3"
                    placeholder={reviewForm.status === 'rejected' ? 'Explain why this claim is being rejected...' : 'Add any review notes...'} />
                  {reviewForm.status === 'rejected' && !reviewForm.reviewNotes && (
                    <label className="label"><span className="label-text-alt text-error">Required for farmer resubmission</span></label>
                  )}
                </div>

                <button onClick={submitReview}
                  disabled={reviewing || !reviewForm.status || (reviewForm.status === 'rejected' && !reviewForm.reviewNotes)}
                  className={`btn w-full gap-2 ${reviewForm.status === 'approved' ? 'btn-success' : reviewForm.status === 'rejected' ? 'btn-error' : 'btn-disabled'}`}>
                  {reviewing ? <Loader2 className="w-4 h-4 animate-spin" /> : null}
                  {reviewing ? 'Processing...' : reviewForm.status === 'approved' ? 'Confirm Approval' : reviewForm.status === 'rejected' ? 'Confirm Rejection' : 'Select action above'}
                </button>
              </div>
            )}

            {/* Already reviewed */}
            {selected.status === 'approved' && (
              <div className="alert alert-success"><CheckCircle2 className="w-4 h-4" />
                <div>
                  <p className="font-bold">Approved</p>
                  {selected.payoutAmount > 0 && <p className="text-sm">Payout: ₹{selected.payoutAmount.toLocaleString('en-IN')}</p>}
                  {selected.reviewNotes && <p className="text-sm opacity-70">{selected.reviewNotes}</p>}
                </div>
              </div>
            )}
            {selected.status === 'rejected' && (
              <div className="alert alert-error"><XCircle className="w-4 h-4" />
                <div>
                  <p className="font-bold">Rejected</p>
                  <p className="text-sm">{selected.rejectionReason || selected.reviewNotes || 'No reason provided'}</p>
                </div>
              </div>
            )}
          </div>
          <form method="dialog" className="modal-backdrop"><button onClick={() => setSelected(null)}>close</button></form>
        </dialog>
      )}

      {/* Table */}
      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="loading loading-spinner loading-lg text-secondary" />
        </div>
      ) : (
        <div className="card bg-base-100 shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr><th>Claim ID</th><th>Farmer</th><th>Crop</th><th>Loss Reason</th><th>Confidence</th><th>Status</th><th>Date</th><th className="text-right">Actions</th></tr>
              </thead>
              <tbody>
                {claims.length === 0 ? (
                  <tr><td colSpan="8" className="text-center py-12 text-base-content/40">
                    <ClipboardCheck className="w-12 h-12 mx-auto mb-3 text-base-content/20" />No claims found
                  </td></tr>
                ) : claims.map(c => {
                  const conf = getConfidence(c);
                  return (
                    <tr key={c._id} className="hover">
                      <td className="font-mono text-xs">{c.documentId}</td>
                      <td>
                        <div>
                          <p className="font-medium">{c.user?.fullName || '—'}</p>
                          <p className="text-xs text-base-content/40">{c.user?.phoneNumber || '—'}</p>
                        </div>
                      </td>
                      <td className="capitalize">{c.cropType || '—'}</td>
                      <td className="capitalize">{c.lossReason || '—'}</td>
                      <td>
                        <div className="flex items-center gap-2">
                          <progress className={`progress w-16 ${parseFloat(conf) >= 70 ? 'progress-success' : parseFloat(conf) >= 30 ? 'progress-warning' : 'progress-error'}`} value={conf} max="100" />
                          <span className="text-xs font-medium">{conf}%</span>
                        </div>
                      </td>
                      <td><span className={`badge badge-sm ${statusBadge(c.status)}`}>{(c.status || '').replace(/_/g, ' ')}</span></td>
                      <td className="text-base-content/40 text-xs">{fmt(c.submittedAt || c.createdAt)}</td>
                      <td className="text-right">
                        <button onClick={() => openDetail(c._id)} className="btn btn-ghost btn-xs gap-1">
                          {needsReview(c.status) ? 'Review' : 'View'} <Eye className="w-3 h-3" />
                        </button>
                      </td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>

          {pagination.pages > 1 && (
            <div className="flex items-center justify-between px-4 py-3 border-t border-base-200">
              <p className="text-xs text-base-content/40">{pagination.total} total claims</p>
              <div className="join">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="join-item btn btn-sm">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="join-item btn btn-sm">Page {page}/{pagination.pages}</button>
                <button onClick={() => setPage(p => Math.min(pagination.pages, p + 1))} disabled={page === pagination.pages} className="join-item btn btn-sm">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
