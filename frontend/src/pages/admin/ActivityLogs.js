import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import {
  Activity, CheckCircle2, XCircle, FileText, Edit3,
  Trash2, UserCog, LogIn, ChevronLeft, ChevronRight
} from 'lucide-react';

const ACTION_CONFIG = {
  approve_claim: { label: 'Approved Claim', Icon: CheckCircle2, color: 'text-success' },
  reject_claim: { label: 'Rejected Claim', Icon: XCircle, color: 'text-error' },
  create_policy: { label: 'Created Policy', Icon: FileText, color: 'text-info' },
  update_policy: { label: 'Updated Policy', Icon: Edit3, color: 'text-warning' },
  delete_policy: { label: 'Deleted Policy', Icon: Trash2, color: 'text-error' },
  toggle_user: { label: 'Toggled User', Icon: UserCog, color: 'text-secondary' },
  login: { label: 'Admin Login', Icon: LogIn, color: 'text-base-content/60' },
};

export default function ActivityLogs() {
  const [logs, setLogs] = useState([]);
  const [loading, setLoading] = useState(true);
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);

  useEffect(() => { fetchLogs(); }, [page]); // eslint-disable-line

  const fetchLogs = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/admin/activity-logs', { params: { page, limit: 20 } });
      if (data.success) { setLogs(data.logs || []); setTotalPages(data.totalPages || 1); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const fmt = (d) => {
    const date = new Date(d);
    return `${date.toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' })} ${date.toLocaleTimeString('en-IN', { hour: '2-digit', minute: '2-digit' })}`;
  };

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
          <Activity className="w-6 h-6 text-secondary" /> Activity Logs
        </h1>
        <p className="text-sm text-base-content/50 mt-1">Audit trail of all admin actions</p>
      </div>

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="loading loading-spinner loading-lg text-secondary" />
        </div>
      ) : logs.length === 0 ? (
        <div className="text-center py-16">
          <Activity className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
          <h3 className="font-medium text-base-content">No activity yet</h3>
          <p className="text-sm text-base-content/40 mt-1">Admin actions will appear here</p>
        </div>
      ) : (
        <>
          <div className="space-y-2">
            {logs.map((log) => {
              const ac = ACTION_CONFIG[log.action] || { label: log.action, Icon: Activity, color: 'text-base-content/60' };
              const ActionIcon = ac.Icon;
              return (
                <div key={log._id} className="card bg-base-100 shadow-sm border border-base-200">
                  <div className="card-body p-4 flex-row items-start gap-4">
                    <div className={`p-2 rounded-lg bg-base-200 ${ac.color} flex-shrink-0`}>
                      <ActionIcon className="w-5 h-5" />
                    </div>
                    <div className="flex-1 min-w-0">
                      <div className="flex items-start justify-between gap-2">
                        <div>
                          <p className={`text-sm font-medium ${ac.color}`}>{ac.label}</p>
                          {log.targetType && (
                            <p className="text-xs text-base-content/40 mt-0.5">
                              {log.targetType}: <span className="font-mono">{log.targetId || '—'}</span>
                            </p>
                          )}
                        </div>
                        <span className="text-xs text-base-content/40 flex-shrink-0">{fmt(log.createdAt)}</span>
                      </div>
                      {log.details && (
                        <p className="text-xs text-base-content/50 mt-2 bg-base-200 p-2 rounded-lg">
                          {typeof log.details === 'string' ? log.details : JSON.stringify(log.details)}
                        </p>
                      )}
                      <div className="flex items-center gap-3 mt-1.5 text-xs text-base-content/30">
                        {log.adminId?.phoneNumber && <span>Admin: {log.adminId.phoneNumber}</span>}
                        {log.ipAddress && <span>IP: {log.ipAddress}</span>}
                      </div>
                    </div>
                  </div>
                </div>
              );
            })}
          </div>

          {totalPages > 1 && (
            <div className="flex justify-center">
              <div className="join">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="join-item btn btn-sm">
                  <ChevronLeft className="w-4 h-4" />
                </button>
                <button className="join-item btn btn-sm">Page {page} of {totalPages}</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="join-item btn btn-sm">
                  <ChevronRight className="w-4 h-4" />
                </button>
              </div>
            </div>
          )}
        </>
      )}
    </div>
  );
}
