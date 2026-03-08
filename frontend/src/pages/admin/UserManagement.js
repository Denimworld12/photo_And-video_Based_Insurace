import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { Users, Search, Loader2, UserCheck, UserX, Phone } from 'lucide-react';

export default function UserManagement() {
  const [users, setUsers] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');
  const [page, setPage] = useState(1);
  const [totalPages, setTotalPages] = useState(1);
  const [toggling, setToggling] = useState(null);

  useEffect(() => { fetchUsers(); }, [page]); // eslint-disable-line

  const fetchUsers = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/admin/users', { params: { page, limit: 15, search: search || undefined } });
      if (data.success) { setUsers(data.users || []); setTotalPages(data.totalPages || 1); }
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const handleSearch = (e) => { e.preventDefault(); setPage(1); fetchUsers(); };

  const toggleActive = async (userId) => {
    try {
      setToggling(userId);
      const { data } = await api.patch(`/api/admin/users/${userId}/toggle-active`);
      if (data.success) setUsers(p => p.map(u => u._id === userId ? { ...u, isActive: data.user?.isActive ?? !u.isActive } : u));
    } catch { alert('Failed to update user status'); }
    finally { setToggling(null); }
  };

  const fmt = (d) => d ? new Date(d).toLocaleDateString('en-IN', { day: 'numeric', month: 'short', year: 'numeric' }) : '—';

  return (
    <div className="space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
          <Users className="w-6 h-6 text-secondary" /> User Management
        </h1>
        <p className="text-sm text-base-content/50 mt-1">Manage registered farmers and admins</p>
      </div>

      <form onSubmit={handleSearch} className="flex gap-3">
        <label className="input input-bordered flex items-center gap-2 flex-1">
          <Search className="w-4 h-4 text-base-content/40" />
          <input type="text" className="grow" placeholder="Search by phone, name, email..." value={search} onChange={(e) => setSearch(e.target.value)} />
        </label>
        <button type="submit" className="btn btn-secondary btn-sm">Search</button>
      </form>

      {loading ? (
        <div className="flex flex-col items-center py-16">
          <span className="loading loading-spinner loading-lg text-secondary" />
          <p className="text-sm text-base-content/40 mt-3">Loading users...</p>
        </div>
      ) : (
        <div className="card bg-base-100 shadow-md overflow-hidden">
          <div className="overflow-x-auto">
            <table className="table table-zebra">
              <thead>
                <tr><th>Phone</th><th>Name</th><th>Email</th><th>Role</th><th>Status</th><th>Joined</th><th>Actions</th></tr>
              </thead>
              <tbody>
                {users.length === 0 ? (
                  <tr><td colSpan="7" className="text-center py-10 text-base-content/40">No users found</td></tr>
                ) : users.map(u => (
                  <tr key={u._id}>
                    <td className="font-mono flex items-center gap-1"><Phone className="w-3 h-3 text-base-content/30" />{u.phoneNumber}</td>
                    <td className="font-medium">{u.fullName || '—'}</td>
                    <td className="text-base-content/50">{u.email || '—'}</td>
                    <td><span className={`badge badge-sm ${u.role === 'admin' ? 'badge-secondary' : 'badge-primary'}`}>{u.role}</span></td>
                    <td>
                      <div className="flex items-center gap-1.5">
                        <div className={`w-2 h-2 rounded-full ${u.isActive ? 'bg-success' : 'bg-error'}`} />
                        <span className="text-xs">{u.isActive ? 'Active' : 'Inactive'}</span>
                      </div>
                    </td>
                    <td className="text-base-content/40 text-xs">{fmt(u.createdAt)}</td>
                    <td>
                      <button onClick={() => toggleActive(u._id)} disabled={toggling === u._id}
                        className={`btn btn-xs gap-1 ${u.isActive ? 'btn-error btn-outline' : 'btn-success btn-outline'}`}>
                        {toggling === u._id ? <Loader2 className="w-3 h-3 animate-spin" /> :
                          u.isActive ? <><UserX className="w-3 h-3" /> Deactivate</> : <><UserCheck className="w-3 h-3" /> Activate</>}
                      </button>
                    </td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {totalPages > 1 && (
            <div className="flex items-center justify-center p-3 border-t border-base-200">
              <div className="join">
                <button onClick={() => setPage(p => Math.max(1, p - 1))} disabled={page === 1} className="join-item btn btn-sm">«</button>
                <button className="join-item btn btn-sm">Page {page} of {totalPages}</button>
                <button onClick={() => setPage(p => Math.min(totalPages, p + 1))} disabled={page === totalPages} className="join-item btn btn-sm">»</button>
              </div>
            </div>
          )}
        </div>
      )}
    </div>
  );
}
