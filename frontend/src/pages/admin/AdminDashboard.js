import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import {
  LayoutDashboard, Users, ClipboardCheck, FileText, Activity,
  AlertTriangle, Banknote, CheckCircle2, XCircle, TrendingUp, ArrowRight, Eye
} from 'lucide-react';

export default function AdminDashboard() {
  const [stats, setStats] = useState({});
  const [recentClaims, setRecentClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const navigate = useNavigate();

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/admin/dashboard');
        if (data.success) {
          setStats(data.stats || {});
          setRecentClaims(data.recentClaims || []);
        }
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const statusBadge = (s) => ({
    approved: 'badge-success', rejected: 'badge-error', processing: 'badge-warning',
    submitted: 'badge-info', 'manual-review': 'badge-warning', manual_review: 'badge-warning',
    'payout-complete': 'badge-success', 'payout-pending': 'badge-secondary',
  }[s] || 'badge-ghost');

  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  if (loading) return (
    <div className="flex items-center justify-center py-24">
      <span className="loading loading-spinner loading-lg text-secondary" />
    </div>
  );

  const pendingCount = (stats.pendingClaims || 0) + (stats.manualReviewClaims || 0);
  const approvalRate = stats.totalClaims > 0 ? ((stats.approvedClaims || 0) / stats.totalClaims * 100).toFixed(1) : '0';

  return (
    <div className="space-y-6">
      <div className="flex flex-col sm:flex-row sm:items-center sm:justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
            <LayoutDashboard className="w-6 h-6 text-secondary" /> Admin Dashboard
          </h1>
          <p className="text-sm text-base-content/50 mt-1">Crop Insurance Platform Overview</p>
        </div>
        <button onClick={() => navigate('/admin/claims')} className="btn btn-secondary btn-sm gap-2">
          <Eye className="w-4 h-4" /> Review Claims
        </button>
      </div>

      {pendingCount > 0 && (
        <div className="alert alert-warning shadow-md">
          <AlertTriangle className="w-5 h-5" />
          <div>
            <h3 className="font-bold">{pendingCount} Claims Require Attention</h3>
            <div className="text-xs">Claims awaiting manual review or approval</div>
          </div>
          <button onClick={() => navigate('/admin/claims')} className="btn btn-sm btn-warning">Review Now</button>
        </div>
      )}

      <div className="stats stats-vertical lg:stats-horizontal shadow w-full">
        <div className="stat">
          <div className="stat-figure text-primary"><Users className="w-8 h-8" /></div>
          <div className="stat-title">Farmers</div>
          <div className="stat-value text-primary">{stats.totalUsers ?? 0}</div>
          <div className="stat-desc">Registered</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-secondary"><ClipboardCheck className="w-8 h-8" /></div>
          <div className="stat-title">Claims</div>
          <div className="stat-value text-secondary">{stats.totalClaims ?? 0}</div>
          <div className="stat-desc">Total Filed</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-warning"><AlertTriangle className="w-8 h-8" /></div>
          <div className="stat-title">Pending</div>
          <div className="stat-value text-warning">{pendingCount}</div>
          <div className="stat-desc">Awaiting Review</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-accent"><Banknote className="w-8 h-8" /></div>
          <div className="stat-title">Payouts</div>
          <div className="stat-value text-accent text-2xl">₹{(stats.totalPayout || 0).toLocaleString('en-IN')}</div>
          <div className="stat-desc">Disbursed</div>
        </div>
      </div>

      <div className="grid grid-cols-3 gap-4">
        {[
          { value: stats.approvedClaims ?? 0, label: 'Approved', Icon: CheckCircle2, color: 'text-success' },
          { value: stats.rejectedClaims ?? 0, label: 'Rejected', Icon: XCircle, color: 'text-error' },
          { value: `${approvalRate}%`, label: 'Approval Rate', Icon: TrendingUp, color: 'text-info' },
        ].map(s => (
          <div key={s.label} className="card bg-base-100 shadow-sm border border-base-200">
            <div className="card-body items-center text-center p-4">
              <s.Icon className={`w-6 h-6 ${s.color}`} />
              <div className={`text-xl font-bold ${s.color}`}>{s.value}</div>
              <div className="text-xs text-base-content/50">{s.label}</div>
            </div>
          </div>
        ))}
      </div>

      <div>
        <h2 className="font-semibold text-base-content mb-3">Quick Actions</h2>
        <div className="grid grid-cols-2 md:grid-cols-4 gap-3">
          {[
            { label: 'Farmer Management', to: '/admin/users', Icon: Users, desc: 'View & manage farmers' },
            { label: 'Claim Review', to: '/admin/claims', Icon: ClipboardCheck, desc: 'Approve or reject' },
            { label: 'Policy Management', to: '/admin/policies', Icon: FileText, desc: 'Create & edit policies' },
            { label: 'Activity Logs', to: '/admin/activity-logs', Icon: Activity, desc: 'Audit trail' },
          ].map(a => (
            <button key={a.to} onClick={() => navigate(a.to)}
              className="card bg-base-100 shadow-sm hover:shadow-md border border-base-200 transition-all">
              <div className="card-body items-center text-center p-5 gap-2">
                <a.Icon className="w-8 h-8 text-secondary" />
                <span className="text-sm font-semibold">{a.label}</span>
                <span className="text-xs text-base-content/40">{a.desc}</span>
              </div>
            </button>
          ))}
        </div>
      </div>

      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <div className="flex items-center justify-between mb-4">
            <h2 className="card-title text-base">Recent Claims</h2>
            <button onClick={() => navigate('/admin/claims')} className="btn btn-ghost btn-sm gap-1">
              View All <ArrowRight className="w-4 h-4" />
            </button>
          </div>
          {recentClaims.length === 0 ? (
            <p className="text-sm text-base-content/40 py-6 text-center">No claims yet</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table table-zebra table-sm">
                <thead><tr><th>Claim ID</th><th>Farmer</th><th>Crop</th><th>AI Score</th><th>Status</th><th>Date</th></tr></thead>
                <tbody>
                  {recentClaims.slice(0, 10).map(c => {
                    const confidence = c.processingResult?.overall_assessment?.confidence_score || c.confidenceScore || 0;
                    return (
                      <tr key={c._id || c.documentId} className="cursor-pointer hover" onClick={() => navigate('/admin/claims')}>
                        <td className="font-mono text-xs">{c.documentId}</td>
                        <td>{c.userId?.phoneNumber || c.userId?.fullName || '—'}</td>
                        <td>{c.formData?.cropType || '—'}</td>
                        <td>{confidence > 0 ? (
                          <span className={`text-xs font-semibold ${confidence > 0.7 ? 'text-success' : confidence > 0.4 ? 'text-warning' : 'text-error'}`}>
                            {(confidence * 100).toFixed(0)}%
                          </span>
                        ) : '—'}</td>
                        <td><span className={`badge badge-sm ${statusBadge(c.status)}`}>{(c.status || '').replace(/_|-/g, ' ')}</span></td>
                        <td className="text-base-content/40 text-xs">{c.createdAt ? fmt(c.createdAt) : '—'}</td>
                      </tr>
                    );
                  })}
                </tbody>
              </table>
            </div>
          )}
        </div>
      </div>
    </div>
  );
}
