import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import {
  ClipboardList, Search, Plus, RefreshCw, Loader2,
  Clock, CheckCircle2, XCircle, AlertTriangle, Eye,
  Banknote, FileText, ArrowRight
} from 'lucide-react';

const STATUS_CONFIG = {
  draft: { badge: 'badge-ghost', label: 'Draft', Icon: FileText },
  submitted: { badge: 'badge-info', label: 'Submitted', Icon: Clock },
  processing: { badge: 'badge-warning', label: 'Processing', Icon: Loader2 },
  approved: { badge: 'badge-success', label: 'Approved', Icon: CheckCircle2 },
  rejected: { badge: 'badge-error', label: 'Rejected', Icon: XCircle },
  manual_review: { badge: 'badge-warning', label: 'Under Review', Icon: Eye },
  'manual-review': { badge: 'badge-warning', label: 'Under Review', Icon: Eye },
  'payout-pending': { badge: 'badge-secondary', label: 'Payout Pending', Icon: Banknote },
  'payout-complete': { badge: 'badge-success', label: 'Completed', Icon: CheckCircle2 },
};

const FILTERS = [
  { key: 'all', label: 'All' },
  { key: 'submitted', label: 'Submitted' },
  { key: 'processing', label: 'Processing' },
  { key: 'manual_review', label: 'Under Review' },
  { key: 'approved', label: 'Approved' },
  { key: 'rejected', label: 'Rejected' },
  { key: 'payout-complete', label: 'Completed' },
];

export default function ClaimStatus() {
  const [claims, setClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [filter, setFilter] = useState('all');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [search, setSearch] = useState('');
  const [error, setError] = useState(null);
  const [resubmitting, setResubmitting] = useState(null);
  const navigate = useNavigate();

  useEffect(() => { fetchClaims(); }, [filter, page]); // eslint-disable-line

  const fetchClaims = async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/claims/list', {
        params: { filter: filter !== 'all' ? filter : undefined, page, limit: 10 }
      });
      if (data.success) {
        setClaims(data.claims || []);
        setTotalPages(data.totalPages || 1);
      }
    } catch {
      setError('Failed to load claims.');
      setClaims([]);
    } finally { setLoading(false); }
  };

  const handleResubmit = async (e, documentId) => {
    e.stopPropagation();
    if (!window.confirm('Resubmit this claim with corrected photos?')) return;
    try {
      setResubmitting(documentId);
      const { data } = await api.post(`/api/claims/resubmit/${documentId}`);
      if (data.success && data.newDocumentId) {
        navigate(`/dashboard/media-capture/${data.newDocumentId}`);
      }
    } catch (err) {
      alert(err.response?.data?.message || 'Resubmission failed.');
    } finally { setResubmitting(null); }
  };

  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { year: 'numeric', month: 'short', day: 'numeric' });

  const filtered = claims.filter(c => {
    const q = (search || '').toLowerCase();
    if (!q) return true;
    const docId = (c.documentId || '').toLowerCase();
    const crop = (c.cropType || c.formData?.cropType || '').toLowerCase();
    return docId.includes(q) || crop.includes(q);
  });

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
            <ClipboardList className="w-6 h-6 text-primary" /> My Claims
          </h1>
          <p className="text-sm text-base-content/50 mt-1">Track and manage your insurance claims</p>
        </div>
        <button onClick={() => navigate('/dashboard/policies')} className="btn btn-primary btn-sm gap-2">
          <Plus className="w-4 h-4" /> New Claim
        </button>
      </div>

      {/* Search & Filters */}
      <div className="space-y-3">
        <label className="input input-bordered flex items-center gap-2">
          <Search className="w-4 h-4 text-base-content/40" />
          <input type="text" className="grow" placeholder="Search by claim ID or crop type..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <div className="flex flex-wrap gap-2">
          {FILTERS.map(f => (
            <button key={f.key} onClick={() => { setFilter(f.key); setPage(1); }}
              className={`btn btn-sm ${filter === f.key ? 'btn-primary' : 'btn-ghost bg-base-200'}`}>
              {f.label}
            </button>
          ))}
        </div>
      </div>

      {/* Error */}
      {error && (
        <div className="alert alert-error">
          <AlertTriangle className="w-5 h-5" />
          <span>{error}</span>
          <button onClick={fetchClaims} className="btn btn-ghost btn-sm">Retry</button>
        </div>
      )}

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center py-16">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-base-content/40 mt-3">Loading claims...</p>
        </div>
      ) : filtered.length > 0 ? (
        <div className="space-y-3">
          {filtered.map(c => {
            const sc = STATUS_CONFIG[c.status] || STATUS_CONFIG.draft;
            const StatusIcon = sc.Icon;
            const dmg = c.processingResult?.phases?.damageAssessment?.percentage || c.processingResult?.damage_percentage;
            const isRejected = c.status === 'rejected';

            return (
              <div key={c._id || c.documentId} onClick={() => navigate(`/dashboard/claim-results/${c.documentId}`)}
                className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer border border-base-200">
                <div className="card-body p-4">
                  {/* Top row */}
                  <div className="flex items-start justify-between mb-2">
                    <div>
                      <p className="font-medium text-base-content text-sm font-mono">{c.documentId}</p>
                      <p className="text-xs text-base-content/40">{c.insuranceId?.name || 'Insurance Plan'}</p>
                    </div>
                    <span className={`badge gap-1 ${sc.badge}`}>
                      <StatusIcon className="w-3 h-3" /> {sc.label}
                    </span>
                  </div>

                  {/* Details grid */}
                  <div className="grid grid-cols-2 sm:grid-cols-4 gap-3 text-sm">
                    <div><p className="text-xs text-base-content/40">Crop</p><p className="font-medium">{c.formData?.cropType || '—'}</p></div>
                    <div><p className="text-xs text-base-content/40">Location</p><p className="font-medium">{c.formData?.state || '—'}</p></div>
                    <div><p className="text-xs text-base-content/40">Area</p><p className="font-medium">{c.formData?.farmArea ? `${c.formData.farmArea} acres` : '—'}</p></div>
                    <div><p className="text-xs text-base-content/40">Submitted</p><p className="font-medium">{c.submittedAt ? fmt(c.submittedAt) : c.createdAt ? fmt(c.createdAt) : '—'}</p></div>
                  </div>

                  {/* AI Confidence */}
                  {c.confidenceScore > 0 && (
                    <div className="mt-3 pt-3 border-t border-base-200">
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-base-content/40">AI Confidence</span>
                        <span className="font-medium">{(c.confidenceScore * 100).toFixed(1)}%</span>
                      </div>
                      <progress className={`progress w-full ${c.confidenceScore > 0.7 ? 'progress-success' : c.confidenceScore > 0.4 ? 'progress-warning' : 'progress-error'}`} value={c.confidenceScore * 100} max="100" />
                    </div>
                  )}

                  {/* Damage */}
                  {dmg != null && (
                    <div className={`${!c.confidenceScore ? 'mt-3 pt-3 border-t border-base-200' : 'mt-2'}`}>
                      <div className="flex items-center justify-between text-xs mb-1">
                        <span className="text-base-content/40">Damage Assessment</span>
                        <span className="font-medium">{dmg}%</span>
                      </div>
                      <progress className={`progress w-full ${dmg > 60 ? 'progress-error' : dmg > 30 ? 'progress-warning' : 'progress-success'}`} value={dmg} max="100" />
                    </div>
                  )}

                  {/* Approved Amount */}
                  {c.financial?.approvedAmount > 0 && (
                    <p className="mt-2 text-sm font-semibold text-success">₹{c.financial.approvedAmount.toLocaleString('en-IN')}</p>
                  )}

                  {/* Rejection + Resubmit */}
                  {isRejected && (
                    <div className="mt-3 pt-3 border-t border-error/20">
                      {c.rejectionReason && (
                        <div className="alert alert-error mb-3">
                          <AlertTriangle className="w-4 h-4" />
                          <div>
                            <p className="text-xs font-medium">Rejection Reason</p>
                            <p className="text-sm">{c.rejectionReason}</p>
                          </div>
                        </div>
                      )}
                      {c.resubmissionCount > 0 && (
                        <p className="text-xs text-base-content/40 mb-2">Previously resubmitted {c.resubmissionCount} time(s)</p>
                      )}
                      <button onClick={(e) => handleResubmit(e, c.documentId)} disabled={resubmitting === c.documentId}
                        className="btn btn-warning btn-sm w-full gap-2">
                        {resubmitting === c.documentId ? (
                          <><Loader2 className="w-4 h-4 animate-spin" /> Resubmitting...</>
                        ) : (
                          <><RefreshCw className="w-4 h-4" /> Resubmit with Corrected Photos</>
                        )}
                      </button>
                    </div>
                  )}
                </div>
              </div>
            );
          })}

          {/* Pagination */}
          {totalPages > 1 && (
            <div className="join flex justify-center pt-4">
              <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="join-item btn btn-sm">«</button>
              <button className="join-item btn btn-sm">Page {page} of {totalPages}</button>
              <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="join-item btn btn-sm">»</button>
            </div>
          )}
        </div>
      ) : (
        <div className="text-center py-16">
          <ClipboardList className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
          <h3 className="font-medium text-base-content">No claims found</h3>
          <p className="text-sm text-base-content/40 mt-1">Submit your first claim to get started</p>
          <button onClick={() => navigate('/dashboard/policies')} className="btn btn-primary btn-sm mt-4 gap-2">
            <ArrowRight className="w-4 h-4" /> Browse Policies
          </button>
        </div>
      )}
    </div>
  );
}
