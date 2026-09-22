import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import { ErrorState, EmptyState, SkeletonList } from '../../components/ui/States';
import {
  Activity, CheckCircle2, XCircle, Eye, FileText, Edit3, UserCheck, UserX, Banknote, Settings,
} from 'lucide-react';

/** Keyed on the AdminAction enum in backend/src/models/AdminAction.js. */
const ACTION = {
  approve_claim: { label: 'Approved a claim', Icon: CheckCircle2 },
  reject_claim: { label: 'Rejected a claim', Icon: XCircle },
  request_review: { label: 'Sent a claim for manual review', Icon: Eye },
  create_policy: { label: 'Created a policy', Icon: FileText },
  update_policy: { label: 'Updated a policy', Icon: Edit3 },
  activate_user: { label: 'Activated an account', Icon: UserCheck },
  deactivate_user: { label: 'Deactivated an account', Icon: UserX },
  process_payout: { label: 'Processed a payout', Icon: Banknote },
  system_config: { label: 'Changed a system setting', Icon: Settings },
};

/** Renders a details payload as readable rows instead of a wall of JSON. */
function LogDetails({ details }) {
  if (!details) return null;

  if (typeof details === 'string') {
    return <p className="mt-2 rounded-md border border-bone bg-parchment px-3 py-2 text-body text-saddle">{details}</p>;
  }

  const entries = Object.entries(details).filter(([, v]) => v !== null && v !== undefined && v !== '');
  if (entries.length === 0) return null;

  return (
    <dl className="mt-2 grid gap-x-4 gap-y-1 rounded-md border border-bone bg-parchment px-3 py-2 sm:grid-cols-2">
      {entries.map(([key, value]) => (
        <div key={key} className="flex items-baseline justify-between gap-3">
          <dt className="label-micro">{key.replace(/[-_]/g, ' ')}</dt>
          <dd className="min-w-0 truncate text-body text-saddle">
            {typeof value === 'object' ? JSON.stringify(value) : String(value)}
          </dd>
        </div>
      ))}
    </dl>
  );
}

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [page, setPage] = useState(1);
  const [pagination, setPagination] = useState({ total: 0, pages: 1 });

  const fetchLogs = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/admin/activity-logs', { params: { page, limit: 20 } });
      if (!data.success) throw new Error(data.error || 'The activity log could not be read.');
      setLogs(data.logs || []);
      setPagination(data.pagination || { total: 0, pages: 1 });
    } catch (err) {
      // An audit trail that silently renders as empty on failure is worse than
      // no audit trail — it reads as "nothing happened".
      setError(err.response?.data?.error || err.message || 'The activity log could not be loaded.');
      setLogs([]);
    } finally {
      setLoading(false);
    }
  }, [page]);

  useEffect(() => {
    fetchLogs();
  }, [fetchLogs]);

  const fmt = (d) => {
    const date = new Date(d);
    return `${date.toLocaleDateString('en-IN', {
      day: 'numeric',
      month: 'short',
      year: 'numeric',
    })} at ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Activity log"
        description="Every action taken from the admin portal, newest first."
      />

      {loading ? (
        <SkeletonList rows={6} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchLogs} />
      ) : logs.length === 0 ? (
        <EmptyState
          icon={Activity}
          title="No activity recorded"
          message="Approvals, rejections, policy edits and account changes are logged here."
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-bone bg-pure-white">
          <ol className="divide-y divide-bone">
            {logs.map((log) => {
              const meta = ACTION[log.action] || { label: (log.action || '').replace(/[-_]/g, ' '), Icon: Activity };
              return (
                <li key={log._id} className="flex items-start gap-4 p-4">
                  <span className="flex h-9 w-9 shrink-0 items-center justify-center rounded-md bg-parchment">
                    <meta.Icon className="h-4 w-4 text-saddle" aria-hidden="true" />
                  </span>
                  <div className="min-w-0 flex-1">
                    <div className="flex flex-wrap items-baseline justify-between gap-2">
                      <p className="text-body font-medium capitalize text-ink">{meta.label}</p>
                      <time className="text-caption text-bark">{fmt(log.createdAt)}</time>
                    </div>
                    {log.targetType && (
                      <p className="text-caption text-bark">
                        {log.targetType}: <span className="font-mono">{log.targetId || '—'}</span>
                      </p>
                    )}
                    <LogDetails details={log.details} />
                    <p className="mt-2 flex flex-wrap gap-x-4 text-caption text-bark">
                      {log.adminId?.phoneNumber && <span>By {log.adminId.phoneNumber}</span>}
                      {log.ipAddress && <span>From {log.ipAddress}</span>}
                    </p>
                  </div>
                </li>
              );
            })}
          </ol>
          <Pagination page={page} totalPages={pagination.pages} onChange={setPage} total={pagination.total} />
        </div>
      )}
    </div>
  );
}
