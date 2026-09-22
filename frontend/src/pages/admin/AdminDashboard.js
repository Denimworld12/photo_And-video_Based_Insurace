import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import StatusBadge from '../../components/ui/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import {
  Users, ClipboardCheck, FileText, Activity, AlertTriangle, ArrowRight, Eye,
} from 'lucide-react';

const QUICK_ACTIONS = [
  { to: '/admin/claims', label: 'Claim verification', desc: 'Approve or reject filed claims', Icon: ClipboardCheck },
  { to: '/admin/users', label: 'Farmer management', desc: 'View and manage accounts', Icon: Users },
  { to: '/admin/policies', label: 'Policy management', desc: 'Create and edit policies', Icon: FileText },
  { to: '/admin/activity-logs', label: 'Activity logs', desc: 'Audit trail of admin actions', Icon: Activity },
];

export default function AdminDashboard() {
  const navigate = useNavigate();
  const [stats, setStats] = useState({});
  const [recentClaims, setRecentClaims] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchDashboard = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/admin/dashboard');
      if (!data.success) throw new Error(data.error || 'The dashboard data could not be read.');
      setStats(data.stats || {});
      setRecentClaims(data.recentClaims || []);
    } catch (err) {
      // The old page swallowed this and rendered every figure as 0 — an admin
      // could not tell an empty platform from an unreachable API.
      setError(err.response?.data?.error || err.message || 'The dashboard could not be loaded.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchDashboard();
  }, [fetchDashboard]);

  if (loading) return <LoadingState label="Loading platform overview…" />;
  if (error) return <ErrorState message={error} onRetry={fetchDashboard} />;

  const pendingCount = (stats.pendingClaims || 0) + (stats.manualReviewClaims || 0);
  const approvalRate =
    stats.totalClaims > 0 ? (((stats.approvedClaims || 0) / stats.totalClaims) * 100).toFixed(1) : '0.0';
  const fmt = (d) => new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });

  return (
    <div className="page-shell space-y-8">
      <PageHeader
        eyebrow="Administration"
        title="Platform overview"
        description="Claims, farmers and payouts across PBI AgriInsure."
        actions={
          <button type="button" onClick={() => navigate('/admin/claims')} className="btn btn-primary">
            <Eye className="h-4 w-4" aria-hidden="true" /> Review claims
          </button>
        }
      />

      {pendingCount > 0 && (
        <div className="flex flex-wrap items-center gap-4 rounded-lg border border-honey-amber bg-honey-amber/20 px-5 py-4">
          <AlertTriangle className="h-5 w-5 shrink-0 text-saddle" aria-hidden="true" />
          <div className="min-w-0 flex-1">
            <p className="text-body-lg font-medium text-ink">
              {pendingCount} claim{pendingCount === 1 ? '' : 's'} waiting on you
            </p>
            <p className="text-body text-saddle">Submitted or flagged for manual review.</p>
          </div>
          <button type="button" onClick={() => navigate('/admin/claims')} className="btn btn-primary btn-sm">
            Review now
          </button>
        </div>
      )}

      <section aria-labelledby="platform-figures">
        <h2 id="platform-figures" className="eyebrow">
          Platform figures
        </h2>
        <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
          <StatTile label="Farmers" value={(stats.totalUsers ?? 0).toLocaleString('en-IN')} hint="Registered" icon={Users} />
          <StatTile label="Claims" value={(stats.totalClaims ?? 0).toLocaleString('en-IN')} hint="Total filed" icon={ClipboardCheck} />
          <StatTile label="Pending" value={pendingCount} hint="Awaiting review" emphasis={pendingCount > 0} icon={AlertTriangle} />
          <StatTile
            label="Disbursed"
            value={`₹${(stats.totalPayout || 0).toLocaleString('en-IN')}`}
            hint="Paid to farmers"
          />
        </div>
        <div className="mt-3 grid grid-cols-3 gap-3">
          <StatTile label="Approved" value={stats.approvedClaims ?? 0} />
          <StatTile label="Rejected" value={stats.rejectedClaims ?? 0} />
          <StatTile label="Approval rate" value={`${approvalRate}%`} />
        </div>
      </section>

      <section aria-labelledby="admin-actions">
        <h2 id="admin-actions" className="eyebrow">
          Go to
        </h2>
        <div className="mt-3 grid gap-3 sm:grid-cols-2">
          {QUICK_ACTIONS.map((a) => (
            <button
              key={a.to}
              type="button"
              onClick={() => navigate(a.to)}
              className="flex items-center gap-4 rounded-lg border border-bone bg-pure-white p-4 text-left transition-colors hover:border-honey-amber"
            >
              <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-parchment">
                <a.Icon className="h-5 w-5 text-saddle" aria-hidden="true" />
              </span>
              <span className="min-w-0 flex-1">
                <span className="block text-body-lg font-medium text-ink">{a.label}</span>
                <span className="block text-body text-bark">{a.desc}</span>
              </span>
              <ArrowRight className="h-4 w-4 shrink-0 text-loam" aria-hidden="true" />
            </button>
          ))}
        </div>
      </section>

      <section aria-labelledby="recent-claims">
        <div className="flex items-baseline justify-between gap-3">
          <h2 id="recent-claims" className="eyebrow">
            Recent claims
          </h2>
          <button
            type="button"
            onClick={() => navigate('/admin/claims')}
            className="btn btn-ghost btn-sm text-saddle"
          >
            View all <ArrowRight className="h-4 w-4" aria-hidden="true" />
          </button>
        </div>

        {recentClaims.length === 0 ? (
          <div className="mt-3">
            <EmptyState icon={ClipboardCheck} title="No claims filed yet" message="Claims appear here as farmers submit them." />
          </div>
        ) : (
          <div className="mt-3 overflow-hidden rounded-lg border border-bone bg-pure-white">
            {/* The table is kept for desktop where six columns compare well,
                and swapped for stacked rows on a phone rather than forcing a
                horizontal scroll. */}
            <ul className="divide-y divide-bone lg:hidden">
              {recentClaims.slice(0, 10).map((c) => (
                <li key={c._id || c.documentId}>
                  <button
                    type="button"
                    onClick={() => navigate('/admin/claims')}
                    className="flex w-full items-start justify-between gap-3 p-4 text-left transition-colors hover:bg-parchment"
                  >
                    <span className="min-w-0">
                      <span className="block font-mono text-caption text-bark">{c.documentId}</span>
                      <span className="mt-0.5 block text-body font-medium capitalize text-ink">
                        {c.formData?.cropType || 'Crop claim'}
                      </span>
                      <span className="block text-caption text-bark">
                        {c.userId?.fullName || c.userId?.phoneNumber || 'Unknown farmer'}
                        {c.createdAt ? ` · ${fmt(c.createdAt)}` : ''}
                      </span>
                    </span>
                    <StatusBadge status={c.status} />
                  </button>
                </li>
              ))}
            </ul>

            <table className="hidden w-full lg:table">
              <thead>
                <tr className="border-b border-bone text-left">
                  {['Claim ID', 'Farmer', 'Crop', 'AI score', 'Status', 'Filed'].map((h) => (
                    <th key={h} className="px-4 py-3 label-micro font-medium">
                      {h}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody className="divide-y divide-bone">
                {recentClaims.slice(0, 10).map((c) => {
                  const confidence =
                    c.processingResult?.overall_assessment?.confidence_score || c.confidenceScore || 0;
                  return (
                    <tr
                      key={c._id || c.documentId}
                      onClick={() => navigate('/admin/claims')}
                      className="cursor-pointer transition-colors hover:bg-parchment"
                    >
                      <td className="px-4 py-3 font-mono text-caption text-saddle">{c.documentId}</td>
                      <td className="px-4 py-3 text-body text-ink">
                        {c.userId?.fullName || c.userId?.phoneNumber || '—'}
                      </td>
                      <td className="px-4 py-3 text-body capitalize text-ink">{c.formData?.cropType || '—'}</td>
                      <td className="px-4 py-3 text-body text-ink">
                        {confidence > 0 ? `${(confidence * 100).toFixed(0)}%` : '—'}
                      </td>
                      <td className="px-4 py-3">
                        <StatusBadge status={c.status} />
                      </td>
                      <td className="px-4 py-3 text-caption text-bark">{c.createdAt ? fmt(c.createdAt) : '—'}</td>
                    </tr>
                  );
                })}
              </tbody>
            </table>
          </div>
        )}
      </section>
    </div>
  );
}
