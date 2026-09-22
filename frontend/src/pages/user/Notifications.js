import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import { ErrorState, EmptyState, SkeletonList } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { Bell, CheckCircle2, XCircle, Banknote, ClipboardList, AlertCircle, CheckCheck } from 'lucide-react';

const TYPE_ICON = {
  claim_update: ClipboardList,
  claim_approved: CheckCircle2,
  claim_rejected: XCircle,
  payout: Banknote,
  system: AlertCircle,
};

export default function Notifications() {
  const toast = useToast();
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [unreadCount, setUnreadCount] = useState(0);
  const [markingAll, setMarkingAll] = useState(false);

  const fetchNotifications = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/notifications');
      setNotifications(data.notifications || []);
      setUnreadCount(data.unreadCount || 0);
    } catch (err) {
      // A failed fetch used to fall through to "No notifications yet", telling
      // the farmer their claim had no updates when the server was simply down.
      setError(err.response?.data?.error || 'We could not load your notifications. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchNotifications();
  }, [fetchNotifications]);

  const markRead = async (id) => {
    const previous = notifications;
    const previousCount = unreadCount;
    setNotifications((prev) => prev.map((n) => (n._id === id ? { ...n, isRead: true } : n)));
    setUnreadCount((c) => Math.max(0, c - 1));
    try {
      await api.patch(`/api/notifications/${id}/read`);
    } catch {
      // The optimistic update used to stick even when the request failed, so
      // the badge cleared locally and came back on the next visit.
      setNotifications(previous);
      setUnreadCount(previousCount);
      toast.error('That notification could not be marked as read.');
    }
  };

  const markAllRead = async () => {
    const previous = notifications;
    const previousCount = unreadCount;
    setMarkingAll(true);
    setNotifications((prev) => prev.map((n) => ({ ...n, isRead: true })));
    setUnreadCount(0);
    try {
      await api.patch('/api/notifications/read-all');
      toast.success('All notifications marked as read.');
    } catch {
      setNotifications(previous);
      setUnreadCount(previousCount);
      toast.error('We could not mark them all as read. Try again in a moment.');
    } finally {
      setMarkingAll(false);
    }
  };

  const relative = (d) => {
    const seconds = (Date.now() - new Date(d)) / 1000;
    if (seconds < 60) return 'Just now';
    if (seconds < 3600) return `${Math.floor(seconds / 60)}m ago`;
    if (seconds < 86400) return `${Math.floor(seconds / 3600)}h ago`;
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="page-shell max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Updates"
        title="Notifications"
        description={
          unreadCount > 0
            ? `${unreadCount} unread update${unreadCount === 1 ? '' : 's'} about your claims.`
            : 'Claim decisions, payouts and alerts appear here.'
        }
        actions={
          unreadCount > 0 && (
            <button type="button" onClick={markAllRead} disabled={markingAll} className="btn btn-outline btn-sm">
              <CheckCheck className="h-4 w-4" aria-hidden="true" /> Mark all read
            </button>
          )
        }
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchNotifications} />
      ) : notifications.length === 0 ? (
        <EmptyState
          icon={Bell}
          title="No notifications yet"
          message="When a claim moves forward, is decided, or a payout is released, you will hear about it here."
        />
      ) : (
        <ul className="space-y-2">
          {notifications.map((n) => {
            const Icon = TYPE_ICON[n.type] || Bell;
            const unread = !n.isRead;

            return (
              <li key={n._id}>
                {/* Was a <div onClick>: unreachable by keyboard, and nothing
                    told a screen reader the item was unread. */}
                <button
                  type="button"
                  onClick={() => unread && markRead(n._id)}
                  aria-label={unread ? `Unread: ${n.title}. Mark as read` : n.title}
                  className={`flex w-full items-start gap-3 rounded-lg border p-4 text-left transition-colors ${
                    unread
                      ? 'border-honey-amber bg-honey-amber/10 hover:bg-honey-amber/20'
                      : 'border-bone bg-pure-white hover:bg-parchment'
                  }`}
                >
                  <span
                    className={`flex h-9 w-9 shrink-0 items-center justify-center rounded-md ${
                      unread ? 'bg-honey-amber/30 text-saddle' : 'bg-parchment text-bark'
                    }`}
                  >
                    <Icon className="h-5 w-5" aria-hidden="true" />
                  </span>
                  <span className="min-w-0 flex-1">
                    <span className="flex items-baseline justify-between gap-3">
                      <span className={`text-body ${unread ? 'font-medium text-ink' : 'text-saddle'}`}>
                        {n.title}
                      </span>
                      <span className="shrink-0 text-caption text-bark">{relative(n.createdAt)}</span>
                    </span>
                    <span className="mt-0.5 block text-body text-bark">{n.message}</span>
                    {unread && <span className="mt-1 block text-caption text-saddle">Tap to mark as read</span>}
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
