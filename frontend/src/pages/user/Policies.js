import React, { useState, useEffect } from 'react';
import { useNavigate } from 'react-router-dom';
import api from '../../utils/api';
import { FileText, Search, ArrowRight, Shield } from 'lucide-react';

export default function Policies() {
  const navigate = useNavigate();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [search, setSearch] = useState('');

  useEffect(() => {
    (async () => {
      try {
        const { data } = await api.get('/api/insurance/list');
        setPolicies(data.insurances || data.policies || []);
      } catch { /* ignore */ }
      finally { setLoading(false); }
    })();
  }, []);

  const filtered = policies.filter(
    (p) => p.name?.toLowerCase().includes(search.toLowerCase()) || p.type?.toLowerCase().includes(search.toLowerCase())
  );

  const typeColor = { crop: 'badge-success', livestock: 'badge-warning', weather: 'badge-info', comprehensive: 'badge-accent' };

  if (loading) {
    return (
      <div className="flex items-center justify-center py-20">
        <span className="loading loading-spinner loading-lg text-primary" />
      </div>
    );
  }

  return (
    <div className="max-w-6xl mx-auto space-y-6">
      <div>
        <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
          <Shield className="w-6 h-6 text-primary" /> Insurance Policies
        </h1>
        <p className="text-base-content/60 mt-1">Select a policy to file a new claim</p>
      </div>

      {/* Search */}
      <label className="input input-bordered flex items-center gap-2 max-w-md">
        <Search className="w-4 h-4 text-base-content/40" />
        <input
          type="text"
          placeholder="Search policies..."
          value={search}
          onChange={(e) => setSearch(e.target.value)}
          className="grow"
        />
      </label>

      {/* Cards */}
      {filtered.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
          <p className="text-base-content/50">No policies found</p>
        </div>
      ) : (
        <div className="grid sm:grid-cols-2 lg:grid-cols-3 gap-4">
          {filtered.map((ins) => (
            <div
              key={ins._id}
              onClick={() => navigate(`/dashboard/submit-claim/${ins._id}`)}
              className="card bg-base-100 shadow-sm hover:shadow-lg transition-all cursor-pointer border border-base-300 hover:border-primary"
            >
              <div className="card-body p-5">
                <div className="flex items-start justify-between">
                  <div className="w-10 h-10 bg-primary/10 rounded-lg flex items-center justify-center">
                    <Shield className="w-5 h-5 text-primary" />
                  </div>
                  <div className={`badge badge-sm ${typeColor[ins.type] || 'badge-ghost'}`}>{ins.type || 'General'}</div>
                </div>
                <h3 className="card-title text-base mt-3">{ins.name}</h3>
                {ins.premiumRate && <p className="text-sm text-base-content/50">Premium Rate: {ins.premiumRate}%</p>}
                {ins.schemes?.length > 0 && (
                  <div className="flex flex-wrap gap-1 mt-1">
                    {ins.schemes.map((s, i) => <span key={i} className="badge badge-outline badge-xs">{typeof s === 'string' ? s : s.name}</span>)}
                  </div>
                )}
                <div className="card-actions justify-end mt-2">
                  <button className="btn btn-primary btn-sm gap-1">
                    Apply <ArrowRight className="w-4 h-4" />
                  </button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
