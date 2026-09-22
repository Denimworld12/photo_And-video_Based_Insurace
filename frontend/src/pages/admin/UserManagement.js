import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import Pagination from '../../components/ui/Pagination';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { TextField } from '../../components/ui/Field';
import { ErrorState, EmptyState, SkeletonList } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { Users, Search, Loader2, UserCheck, UserX } from 'lucide-react';

export default function UserManagement() {
  const toast = useToast();
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [search, setSearch] = useState('');
  const [appliedSearch, setAppliedSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toggling, setToggling] = useState(null);
  const [confirmTarget, setConfirmTarget] = useState(null);

  const fetchUsers = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/admin/users', {
        params: { page, limit: 15, search: appliedSearch || undefined },
      });
      if (!data.success) throw new Error(data.error || 'The user list could not be read.');
      setUsers(data.users || []);
      setTotalPages(data.totalPages || 1);
    } catch (err) {
      setError(err.response?.data?.error || err.message || 'The user list could not be loaded.');
      setUsers([]);
    } finally {
      setLoading(false);
    }
  }, [page, appliedSearch]);

  useEffect(() => {
    fetchUsers();
  }, [fetchUsers]);

  const handleSearch = (e) => {
    e.preventDefault();
    setPage(1);
    setAppliedSearch(search.trim());
  };

  const toggleActive = async (user) => {
    try {
      setToggling(user._id);
      const { data } = await api.patch(`/api/admin/users/${user._id}/toggle-active`);
      if (data.success) {
        const nowActive = data.user?.isActive ?? !user.isActive;
        setUsers((prev) => prev.map((u) => (u._id === user._id ? { ...u, isActive: nowActive } : u)));
        // Previously there was no success feedback at all, so the only way to
        // tell whether a deactivation had landed was to squint at the dot.
        toast.success(
          `${user.fullName || user.phoneNumber} ${nowActive ? 'can sign in again' : 'can no longer sign in'}.`
        );
      } else {
        toast.error(data.error || 'The account status could not be changed.');
      }
    } catch (err) {
      toast.error(err.response?.data?.error || 'The account status could not be changed.');
    } finally {
      setToggling(null);
      setConfirmTarget(null);
    }
  };

  const fmt = (d) =>
    d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  const ActiveDot = ({ active }) => (
    <span className="flex items-center gap-1.5">
      <span
        aria-hidden="true"
        className={`h-2 w-2 shrink-0 rounded-md ${active ? 'bg-sage' : 'bg-loam'}`}
      />
      <span className="text-body text-saddle">{active ? 'Active' : 'Deactivated'}</span>
    </span>
  );

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Farmers and admins"
        description="Every registered account. Deactivating an account blocks sign-in immediately."
      />

      <form onSubmit={handleSearch} className="flex flex-col gap-3 sm:flex-row sm:items-end">
        <div className="flex-1 sm:max-w-md">
          <TextField
            label="Search accounts"
            icon={Search}
            type="search"
            placeholder="Phone, name or email"
            value={search}
            onChange={setSearch}
          />
        </div>
        <button type="submit" className="btn btn-primary">
          Search
        </button>
        {appliedSearch && (
          <button
            type="button"
            onClick={() => {
              setSearch('');
              setAppliedSearch('');
              setPage(1);
            }}
            className="btn btn-outline"
          >
            Clear
          </button>
        )}
      </form>

      {loading ? (
        <SkeletonList rows={5} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchUsers} />
      ) : users.length === 0 ? (
        <EmptyState
          icon={Users}
          title={appliedSearch ? `No account matches “${appliedSearch}”` : 'No accounts yet'}
          message={appliedSearch ? 'Try a phone number, or clear the search.' : 'Farmers appear here once they sign up.'}
        />
      ) : (
        <div className="overflow-hidden rounded-lg border border-bone bg-pure-white">
          {/* Seven columns forced a horizontal scroll on anything narrower than
              a laptop. Below `lg` the same record reads as a stacked card. */}
          <ul className="divide-y divide-bone lg:hidden">
            {users.map((u) => (
              <li key={u._id} className="space-y-3 p-4">
                <div className="flex items-start justify-between gap-3">
                  <div className="min-w-0">
                    <p className="text-body-lg font-medium text-ink">{u.fullName || 'No name given'}</p>
                    <p className="font-mono text-body text-saddle">{u.phoneNumber}</p>
                    {u.email && <p className="truncate text-caption text-bark">{u.email}</p>}
                  </div>
                  <span className="shrink-0 rounded-md border border-bone px-2 py-0.5 text-caption capitalize text-bark">
                    {u.role}
                  </span>
                </div>
                <div className="flex items-center justify-between gap-3">
                  <ActiveDot active={u.isActive} />
                  <span className="text-caption text-bark">Joined {fmt(u.createdAt)}</span>
                </div>
                <button
                  type="button"
                  onClick={() => setConfirmTarget(u)}
                  disabled={toggling === u._id}
                  className="btn btn-outline btn-sm w-full"
                >
                  {toggling === u._id ? (
                    <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                  ) : u.isActive ? (
                    <UserX className="h-4 w-4" aria-hidden="true" />
                  ) : (
                    <UserCheck className="h-4 w-4" aria-hidden="true" />
                  )}
                  {u.isActive ? 'Deactivate' : 'Reactivate'}
                </button>
              </li>
            ))}
          </ul>

          <table className="hidden w-full lg:table">
            <thead>
              <tr className="border-b border-bone text-left">
                {['Phone', 'Name', 'Email', 'Role', 'Status', 'Joined', ''].map((h, i) => (
                  <th
                    key={h || i}
                    className="px-4 py-3 label-micro font-medium"
                  >
                    {h}
                  </th>
                ))}
              </tr>
            </thead>
            <tbody className="divide-y divide-bone">
              {users.map((u) => (
                <tr key={u._id} className="transition-colors hover:bg-parchment">
                  <td className="px-4 py-3 font-mono text-body text-ink">{u.phoneNumber}</td>
                  <td className="px-4 py-3 text-body text-ink">{u.fullName || '—'}</td>
                  <td className="px-4 py-3 text-body text-bark">{u.email || '—'}</td>
                  <td className="px-4 py-3">
                    <span className="rounded-md border border-bone px-2 py-0.5 text-caption capitalize text-bark">
                      {u.role}
                    </span>
                  </td>
                  <td className="px-4 py-3">
                    <ActiveDot active={u.isActive} />
                  </td>
                  <td className="px-4 py-3 text-caption text-bark">{fmt(u.createdAt)}</td>
                  <td className="px-4 py-3 text-right">
                    <button
                      type="button"
                      onClick={() => setConfirmTarget(u)}
                      disabled={toggling === u._id}
                      className="btn btn-outline btn-sm"
                    >
                      {toggling === u._id ? (
                        <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                      ) : u.isActive ? (
                        <UserX className="h-4 w-4" aria-hidden="true" />
                      ) : (
                        <UserCheck className="h-4 w-4" aria-hidden="true" />
                      )}
                      {u.isActive ? 'Deactivate' : 'Reactivate'}
                    </button>
                  </td>
                </tr>
              ))}
            </tbody>
          </table>

          <Pagination page={page} totalPages={totalPages} onChange={setPage} />
        </div>
      )}

      {/* Deactivating locks a farmer out of a platform they file insurance
          claims on. It used to happen on a single unguarded click. */}
      <ConfirmDialog
        open={Boolean(confirmTarget)}
        busy={toggling === confirmTarget?._id}
        onCancel={() => setConfirmTarget(null)}
        onConfirm={() => toggleActive(confirmTarget)}
        tone={confirmTarget?.isActive ? 'danger' : 'primary'}
        title={confirmTarget?.isActive ? 'Deactivate this account?' : 'Reactivate this account?'}
        description={
          confirmTarget?.isActive
            ? 'They will be signed out and unable to sign in or file claims until the account is reactivated. Existing claims are not deleted.'
            : 'They will be able to sign in and file claims again.'
        }
        summary={
          confirmTarget
            ? [
                { label: 'Name', value: confirmTarget.fullName || 'No name given' },
                { label: 'Phone', value: confirmTarget.phoneNumber },
                { label: 'Role', value: confirmTarget.role },
              ]
            : []
        }
        confirmLabel={confirmTarget?.isActive ? 'Deactivate account' : 'Reactivate account'}
      />
    </div>
  );
}
