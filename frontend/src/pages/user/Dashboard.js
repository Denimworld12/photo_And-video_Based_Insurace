import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import {
  LayoutDashboard, FileText, ClipboardList, Plus, ArrowRight,
  Clock, CheckCircle2, XCircle, AlertTriangle, TrendingUp
} from 'lucide-react';

const statusBadge = {
  draft: 'badge-ghost',
  submitted: 'badge-info',
  processing: 'badge-warning',
  manual_review: 'badge-warning',
  approved: 'badge-success',
  rejected: 'badge-error',
  payout_pending: 'badge-accent',
  payout_complete: 'badge-success',
};

const Dashboard = () => {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);

  useEffect(() => {
    const fetchData = async () => {
      try {
        const [claimsRes, policiesRes] = await Promise.all([
          api.get('/api/claims/list?limit=10').catch(() => ({ data: { claims: [] } })),
          api.get('/api/insurance/list').catch(() => ({ data: { insurances: [], policies: [] } })),
        ]);
        setClaims(claimsRes.data.claims || []);
        setPolicies(policiesRes.data.insurances || policiesRes.data.policies || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    };
    fetchData();
  }, []);

  const stats = {
    total: claims.length,
    pending: claims.filter((c) => c && ['submitted', 'processing', 'manual_review', 'draft'].includes(c.status)).length,
    approved: claims.filter((c) => c && ['approved', 'payout_pending', 'payout_complete'].includes(c.status)).length,
    rejected: claims.filter((c) => c && c.status === 'rejected').length,
  };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-8">
      {/* Welcome */}
      <div>
        <h1 className="text-2xl sm:text-3xl font-bold text-base-content flex items-center gap-2">
          <LayoutDashboard className="w-7 h-7 text-primary" />
          Welcome, {user?.fullName || 'Farmer'}
        </h1>
        <p className="text-base-content/60 mt-1">Manage your crop insurance policies and claims</p>
      </div>

      {/* Stats */}
      <div className="stats stats-vertical sm:stats-horizontal shadow w-full bg-base-100">
        <div className="stat">
          <div className="stat-figure text-primary"><TrendingUp className="w-8 h-8" /></div>
          <div className="stat-title">Total Claims</div>
          <div className="stat-value text-primary">{stats.total}</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-warning"><Clock className="w-8 h-8" /></div>
          <div className="stat-title">Pending</div>
          <div className="stat-value text-warning">{stats.pending}</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-success"><CheckCircle2 className="w-8 h-8" /></div>
          <div className="stat-title">Approved</div>
          <div className="stat-value text-success">{stats.approved}</div>
        </div>
        <div className="stat">
          <div className="stat-figure text-error"><XCircle className="w-8 h-8" /></div>
          <div className="stat-title">Rejected</div>
          <div className="stat-value text-error">{stats.rejected}</div>
        </div>
      </div>

      {/* Quick Actions */}
      <div className="grid sm:grid-cols-2 gap-4">
        <div onClick={() => navigate('/dashboard/policies')} className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div className="card-body flex-row items-center gap-4">
            <div className="w-12 h-12 bg-primary/10 rounded-xl flex items-center justify-center shrink-0">
              <Plus className="w-6 h-6 text-primary" />
            </div>
            <div className="flex-1">
              <h3 className="card-title text-base">File New Claim</h3>
              <p className="text-sm text-base-content/60">Select a policy and submit a crop damage claim</p>
            </div>
            <ArrowRight className="w-5 h-5 text-base-content/30" />
          </div>
        </div>
        <div onClick={() => navigate('/dashboard/claims')} className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer">
          <div className="card-body flex-row items-center gap-4">
            <div className="w-12 h-12 bg-secondary/10 rounded-xl flex items-center justify-center shrink-0">
              <ClipboardList className="w-6 h-6 text-secondary" />
            </div>
            <div className="flex-1">
              <h3 className="card-title text-base">View My Claims</h3>
              <p className="text-sm text-base-content/60">Track claim status, results, and payouts</p>
            </div>
            <ArrowRight className="w-5 h-5 text-base-content/30" />
          </div>
        </div>
      </div>

      {/* Active Policies */}
      {policies.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-base-content mb-4 flex items-center gap-2">
            <FileText className="w-5 h-5 text-primary" /> Available Policies
          </h2>
          <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
            {policies.slice(0, 6).map((p) => (
              <div key={p._id} className="card bg-base-100 shadow-sm hover:shadow-md transition-shadow cursor-pointer"
                   onClick={() => navigate(`/dashboard/submit-claim/${p._id}`)}>
                <div className="card-body p-5">
                  <h3 className="font-semibold text-base-content">{p.name}</h3>
                  <div className="badge badge-primary badge-outline badge-sm">{p.type || 'Crop'}</div>
                  {p.premiumRate && <p className="text-xs text-base-content/50">Premium: {p.premiumRate}%</p>}
                </div>
              </div>
            ))}
          </div>
        </div>
      )}

      {/* Recent Claims */}
      {claims.length > 0 && (
        <div>
          <h2 className="text-lg font-semibold text-base-content mb-4 flex items-center gap-2">
            <AlertTriangle className="w-5 h-5 text-warning" /> Recent Claims
          </h2>
          <div className="overflow-x-auto">
            <table className="table table-zebra bg-base-100">
              <thead>
                <tr>
                  <th>Claim ID</th>
                  <th>Crop</th>
                  <th>Status</th>
                  <th>Submitted</th>
                  <th></th>
                </tr>
              </thead>
              <tbody>
                {claims.slice(0, 5).map((c) => (
                  <tr key={c._id} className="hover">
                    <td className="font-mono text-xs">{c.documentId}</td>
                    <td className="capitalize">{c.cropType || '—'}</td>
                    <td>
                      <span className={`badge badge-sm ${statusBadge[c.status] || 'badge-ghost'}`}>
                        {(c.status || '').replace(/_/g, ' ')}
                      </span>
                    </td>
                    <td className="text-xs text-base-content/50">
                      {c.submittedAt ? new Date(c.submittedAt).toLocaleDateString('en-IN') : '—'}
                    </td>
                    <td>
                      <button onClick={() => navigate(`/dashboard/claim-results/${c.documentId}`)} className="btn btn-ghost btn-xs gap-1">
                        View <ArrowRight className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        </div>
      )}
    </div>
  );
};

export default Dashboard;
