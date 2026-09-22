import React, { useCallback, useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import { TextField } from '../../components/ui/Field';
import { LoadingState, ErrorState, EmptyState } from '../../components/ui/States';
import { FileText, Search, ArrowRight, Shield } from 'lucide-react';

export default function Policies() {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');

  const fetchPolicies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/insurance/list');
      setPolicies(data.insurances || data.policies || []);
    } catch (err) {
      setError(err.response?.data?.error || 'We could not load the policy list. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const query = search.trim().toLowerCase();
  const filtered = query
    ? policies.filter(
        (p) => p.name?.toLowerCase().includes(query) || p.type?.toLowerCase().includes(query)
      )
    : policies;

  if (loading) return <LoadingState label="Loading policies…" />;
  if (error) return <ErrorState message={error} onRetry={fetchPolicies} />;

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Insurance"
        title="Policies"
        description="Choose the policy your crop is insured under to start a claim."
      />

      {policies.length > 0 && (
        <div className="max-w-md">
          <TextField
            label="Search"
            icon={Search}
            type="search"
            placeholder="Policy name or type"
            value={search}
            onChange={setSearch}
          />
        </div>
      )}

      {/* An empty result set and an empty catalogue are different situations
          and now say different things. Previously both read "No policies found". */}
      {policies.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No policies published yet"
          message="Insurance policies appear here once they are published for your region."
          action={
            <button type="button" onClick={fetchPolicies} className="btn btn-outline">
              Check again
            </button>
          }
        />
      ) : filtered.length === 0 ? (
        <EmptyState
          icon={Search}
          title={`Nothing matches “${search.trim()}”`}
          message="Try a shorter search, or clear it to see every policy."
          action={
            <button type="button" onClick={() => setSearch('')} className="btn btn-outline">
              Clear search
            </button>
          }
        />
      ) : (
        <ul className="grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
          {filtered.map((ins) => (
            <li key={ins._id}>
              {/* The whole card is the control. It used to be a <div onClick>
                  wrapping a dead "Apply" <button> with no handler of its own —
                  two things that looked clickable, one that was. */}
              <button
                type="button"
                onClick={() => navigate(`/dashboard/submit-claim/${ins._id}`)}
                className="group flex h-full w-full flex-col rounded-lg border border-bone bg-pure-white p-5 text-left transition-colors hover:border-honey-amber"
              >
                <span className="flex w-full items-start justify-between gap-3">
                  <span className="flex h-10 w-10 shrink-0 items-center justify-center rounded-md bg-honey-amber/25">
                    <Shield className="h-5 w-5 text-saddle" aria-hidden="true" />
                  </span>
                  <span className="eyebrow">{ins.type || 'General'}</span>
                </span>

                <span className="mt-4 block text-body-lg font-medium text-ink">{ins.name}</span>
                {ins.shortDescription && (
                  <span className="mt-1 line-clamp-2 block text-body text-bark">{ins.shortDescription}</span>
                )}
                {ins.premiumRate ? (
                  <span className="mt-1 block text-body text-bark">{ins.premiumRate}% premium rate</span>
                ) : null}

                {ins.schemes?.length > 0 && (
                  <span className="mt-3 flex flex-wrap gap-1.5">
                    {ins.schemes.slice(0, 3).map((s, i) => (
                      <span
                        key={i}
                        className="rounded-md border border-bone px-2 py-0.5 text-caption text-bark"
                      >
                        {typeof s === 'string' ? s : s.name}
                      </span>
                    ))}
                  </span>
                )}

                <span className="mt-4 flex items-center gap-1 pt-1 text-body font-medium text-saddle group-hover:text-ink">
                  Start a claim <ArrowRight className="h-4 w-4" aria-hidden="true" />
                </span>
              </button>
            </li>
          ))}
        </ul>
      )}
    </div>
  );
}
