import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Bell, CheckCircle2, XCircle, Banknote, ClipboardList,
  AlertCircle, CheckCheck
} from 'lucide-react';

const TYPE_ICON = {
  claim_update: ClipboardList,
  claim_approved: CheckCircle2,
  claim_rejected: XCircle,
  payout: Banknote,
  system: AlertCircle,
};

export default function Notifications() {
  const [notifications, setNotifications] = useState([]);
  const [loading, setLoading] = useState(true);
  const [unreadCount, setUnreadCount] = useState(0);

  useEffect(() => { fetchNotifications(); }, []);

  const fetchNotifications = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/notifications');
      if (data.success) {
        setNotifications(data.notifications || []);
        setUnreadCount(data.unreadCount || 0);
      }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const markRead = async (id) => {
    try {
      await api.patch(`/api/notifications/${id}/read`);
      setNotifications(p => p.map(n => n._id === id ? { ...n, isRead: true } : n));
      setUnreadCount(p => Math.max(0, p - 1));
    } catch { /* ignore */ }
  };

  const markAllRead = async () => {
    try {
      await api.patch('/api/notifications/read-all');
      setNotifications(p => p.map(n => ({ ...n, isRead: true })));
      setUnreadCount(0);
    } catch { /* ignore */ }
  };

  const fmt = (d) => {
    const diff = (Date.now() - new Date(d)) / 1000;
    if (diff < 60) return 'Just now';
    if (diff < 3600) return `${Math.floor(diff / 60)}m ago`;
    if (diff < 86400) return `${Math.floor(diff / 3600)}h ago`;
    return new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short' });
  };

  return (
    <div className="space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
            <Bell className="w-6 h-6 text-primary" /> Notifications
          </h1>
          {unreadCount > 0 && (
            <p className="text-sm text-base-content/50 mt-1">
              <span className="badge badge-primary badge-sm">{unreadCount}</span> unread
            </p>
          )}
        </div>
        {unreadCount > 0 && (
          <button onClick={markAllRead} className="btn btn-ghost btn-sm gap-2">
            <CheckCheck className="w-4 h-4" /> Mark all read
          </button>
        )}
      </div>

      {/* Content */}
      {loading ? (
        <div className="flex flex-col items-center py-16">
          <span className="loading loading-spinner loading-lg text-primary" />
          <p className="text-sm text-base-content/40 mt-3">Loading...</p>
        </div>
      ) : notifications.length === 0 ? (
        <div className="text-center py-16">
          <Bell className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
          <h3 className="font-medium text-base-content">No notifications yet</h3>
          <p className="text-sm text-base-content/40 mt-1">You'll see claim updates and alerts here</p>
        </div>
      ) : (
        <div className="space-y-2">
          {notifications.map(n => {
            const Icon = TYPE_ICON[n.type] || Bell;
            return (
              <div
                key={n._id}
                onClick={() => !n.isRead && markRead(n._id)}
                className={`card bg-base-100 cursor-pointer transition-all border ${
                  !n.isRead ? 'border-l-4 border-l-primary border-primary/20 bg-primary/5' : 'border-base-200 hover:bg-base-200/50'
                }`}
              >
                <div className="card-body p-4 flex-row items-start gap-3">
                  <div className={`p-2 rounded-lg flex-shrink-0 ${!n.isRead ? 'bg-primary/10 text-primary' : 'bg-base-200 text-base-content/40'}`}>
                    <Icon className="w-5 h-5" />
                  </div>
                  <div className="flex-1 min-w-0">
                    <div className="flex items-start justify-between gap-2">
                      <h3 className={`text-sm ${!n.isRead ? 'font-semibold text-base-content' : 'font-medium text-base-content/70'}`}>{n.title}</h3>
                      <span className="text-xs text-base-content/40 flex-shrink-0">{fmt(n.createdAt)}</span>
                    </div>
                    <p className="text-sm text-base-content/50 mt-0.5">{n.message}</p>
                  </div>
                  {!n.isRead && <div className="w-2.5 h-2.5 rounded-full bg-primary flex-shrink-0 mt-1.5" />}
                </div>
              </div>
            );
          })}
        </div>
      )}
    </div>
  );
}
