import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import StatTile from '../../components/ui/StatTile';
import StatusBadge from '../../components/ui/StatusBadge';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { FileText, ClipboardList, Plus, ArrowRight, Sprout } from 'lucide-react';

const PENDING = ['submitted', 'processing', 'manual_review', 'draft'];
const SETTLED = ['approved', 'payout_pending', 'payout_complete'];

export default function Dashboard() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [claims, setClaims] = useState([]);
  const [totalClaims, setTotalClaims] = useState(0);
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);

  const fetchData = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const [claimsRes, policiesRes] = await Promise.all([
        api.get('/api/claims/list?limit=10'),
        api.get('/api/insurance/list'),
      ]);
      setClaims(claimsRes.data.claims || []);
      setTotalClaims(claimsRes.data.pagination?.total ?? (claimsRes.data.claims || []).length);
      setPolicies(policiesRes.data.insurances || policiesRes.data.policies || []);
    } catch (err) {
      // Previously both requests were `.catch(() => empty)`, so a dead backend
      // rendered a dashboard full of confident zeros.
      setError(err.response?.data?.error || 'We could not reach the server. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchData();
  }, [fetchData]);

  const stats = {
    total: totalClaims,
    pending: claims.filter((c) => c && PENDING.includes(c.status)).length,
    approved: claims.filter((c) => c && SETTLED.includes(c.status)).length,
    rejected: claims.filter((c) => c && c.status === 'rejected').length,
  };

  const firstName = (user?.fullName || '').split(' ')[0];

  if (loading) return <LoadingState label="Loading your dashboard…" />;
  if (error) return <ErrorState message={error} onRetry={fetchData} />;

  const hasNothing = claims.length === 0 && policies.length === 0;

  return (
    <div className="page-shell space-y-8">
      <PageHeader
        eyebrow="Farmer portal"
        title={firstName ? `Welcome back, ${firstName}` : 'Welcome back'}
        description="Your crop insurance policies and claims, in one place."
        actions={
          <button type="button" onClick={() => navigate('/dashboard/policies')} className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> File a claim
          </button>
        }
      />

      {hasNothing ? (
        <EmptyState
          icon={Sprout}
          title="Nothing here yet"
          message="Once insurance policies are published for your state, they will appear here and you can file your first claim."
          action={
            <button type="button" onClick={fetchData} className="btn btn-outline">
              Check again
            </button>
          }
        />
      ) : (
        <>
          <section aria-labelledby="claims-summary">
            <h2 id="claims-summary" className="eyebrow">
              Your claims
            </h2>
            <div className="mt-3 grid grid-cols-2 gap-3 lg:grid-cols-4">
              <StatTile label="Total filed" value={stats.total} />
              <StatTile label="In progress" value={stats.pending} emphasis={stats.pending > 0} />
              <StatTile label="Approved" value={stats.approved} />
              <StatTile label="Rejected" value={stats.rejected} />
            </div>
          </section>

          <section aria-labelledby="quick-actions">
            <h2 id="quick-actions" className="eyebrow">
              Quick actions
            </h2>
            <div className="mt-3 grid gap-3 sm:grid-cols-2">
              {[
                {
                  to: '/dashboard/policies',
                  Icon: Plus,
                  title: 'File a new claim',
                  desc: 'Pick a policy, describe the damage, capture photos.',
                },
                {
                  to: '/dashboard/claims',
                  Icon: ClipboardList,
                  title: 'Track my claims',
                  desc: 'Status, AI assessment and payout for every claim.',
                },
              ].map((a) => (
                // These were <div onClick> before: not focusable, not
                // announced, and no keyboard path to the app's two main tasks.
                <button
                  key={a.to}
                  type="button"
                  onClick={() => navigate(a.to)}
                  className="flex items-center gap-4 rounded-lg border border-bone bg-pure-white p-4 text-left transition-colors hover:border-honey-amber"
                >
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-honey-amber/25">
                    <a.Icon className="h-5 w-5 text-saddle" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="block text-body-lg font-medium text-ink">{a.title}</span>
                    <span className="block text-body text-bark">{a.desc}</span>
                  </span>
                  <ArrowRight className="h-4 w-4 shrink-0 text-loam" aria-hidden="true" />
                </button>
              ))}
            </div>
          </section>

          {policies.length > 0 && (
            <section aria-labelledby="available-policies">
              <div className="flex items-baseline justify-between gap-3">
                <h2 id="available-policies" className="eyebrow">
                  Available policies
                </h2>
                <button
                  type="button"
                  onClick={() => navigate('/dashboard/policies')}
                  className="btn btn-ghost btn-sm text-saddle"
                >
                  See all <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </button>
              </div>
              <ul className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
                {policies.slice(0, 6).map((p) => (
                  <li key={p._id}>
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard/submit-claim/${p._id}`)}
                      className="flex h-full w-full flex-col items-start gap-1 rounded-lg border border-bone bg-pure-white p-4 text-left transition-colors hover:border-honey-amber"
                    >
                      <span className="eyebrow">{p.type || 'Crop'}</span>
                      <span className="text-body-lg font-medium text-ink">{p.name}</span>
                      {p.premiumRate ? (
                        <span className="text-body text-bark">{p.premiumRate}% premium</span>
                      ) : null}
                    </button>
                  </li>
                ))}
              </ul>
            </section>
          )}

          <section aria-labelledby="recent-claims">
            <h2 id="recent-claims" className="eyebrow">
              Recent claims
            </h2>
            {claims.length === 0 ? (
              <div className="mt-3">
                <EmptyState
                  icon={FileText}
                  title="No claims filed yet"
                  message="When you file a claim it will appear here with its status and AI assessment."
                  action={
                    <button
                      type="button"
                      onClick={() => navigate('/dashboard/policies')}
                      className="btn btn-primary"
                    >
                      <Plus className="h-4 w-4" aria-hidden="true" /> File your first claim
                    </button>
                  }
                />
              </div>
            ) : (
              <ul className="mt-3 divide-y divide-bone overflow-hidden rounded-lg border border-bone bg-pure-white">
                {claims.slice(0, 5).map((c) => (
                  <li key={c._id || c.documentId}>
                    {/* A table forced a horizontal scroll on a phone; the same
                        five fields stack cleanly as a list row instead. */}
                    <button
                      type="button"
                      onClick={() => navigate(`/dashboard/claim-results/${c.documentId}`)}
                      className="flex w-full items-center gap-3 p-4 text-left transition-colors hover:bg-parchment"
                    >
                      <span className="min-w-0 flex-1">
                        <span className="block truncate font-mono text-caption text-bark">{c.documentId}</span>
                        <span className="mt-0.5 block text-body font-medium capitalize text-ink">
                          {c.cropType || c.formData?.cropType || 'Crop claim'}
                        </span>
                        <span className="mt-0.5 block text-caption text-bark">
                          {c.submittedAt
                            ? new Date(c.submittedAt).toLocaleDateString('en-IN', {
                                day: 'numeric',
                                month: 'short',
                                year: 'numeric',
                              })
                            : 'Not submitted'}
                        </span>
                      </span>
                      <StatusBadge status={c.status} />
                      <ArrowRight className="h-4 w-4 shrink-0 text-loam" aria-hidden="true" />
                    </button>
                  </li>
                ))}
              </ul>
            )}
          </section>
        </>
      )}
    </div>
  );
}
