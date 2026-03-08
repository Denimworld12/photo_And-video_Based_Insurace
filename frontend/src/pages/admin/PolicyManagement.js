import React, { useState, useEffect } from 'react';
import api from '../../utils/api';
import { FileText, Plus, Edit3, Trash2, X, Save, Loader2 } from 'lucide-react';

const emptyPolicy = { name: '', code: '', type: 'crop', shortDescription: '', schemes: [], availableStates: [], premiumRate: '', isActive: true };

export default function PolicyManagement() {
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [editing, setEditing] = useState(null);
  const [form, setForm] = useState(emptyPolicy);
  const [saving, setSaving] = useState(false);

  useEffect(() => { fetchPolicies(); }, []);

  const fetchPolicies = async () => {
    try {
      setLoading(true);
      const { data } = await api.get('/api/insurance/list');
      if (data.success) setPolicies(data.insurances || []);
    } catch { /* ignore */ }
    finally { setLoading(false); }
  };

  const startCreate = () => { setForm(emptyPolicy); setEditing('new'); };
  const startEdit = (p) => {
    setForm({
      name: p.name || '', code: p.code || '', type: p.type || 'crop',
      shortDescription: p.shortDescription || '',
      schemes: p.schemes || [], availableStates: p.availableStates || [],
      premiumRate: p.premiumRate || '', isActive: p.isActive ?? true,
    });
    setEditing(p._id);
  };
  const cancel = () => { setEditing(null); setForm(emptyPolicy); };

  const handleSave = async () => {
    if (!form.name || !form.code) return alert('Name and Code are required');
    try {
      setSaving(true);
      if (editing === 'new') {
        const { data } = await api.post('/api/insurance', form);
        if (data.success) { setPolicies(p => [...p, data.policy]); cancel(); }
      } else {
        const { data } = await api.put(`/api/insurance/${editing}`, form);
        if (data.success) { setPolicies(p => p.map(x => x._id === editing ? data.policy : x)); cancel(); }
      }
    } catch (err) { alert(err.response?.data?.message || 'Save failed'); }
    finally { setSaving(false); }
  };

  const handleDelete = async (id) => {
    if (!window.confirm('Delete this policy?')) return;
    try { await api.delete(`/api/insurance/${id}`); setPolicies(p => p.filter(x => x._id !== id)); }
    catch { alert('Delete failed'); }
  };

  const typeBadge = (t) => ({ crop: 'badge-success', weather: 'badge-info', livestock: 'badge-warning', comprehensive: 'badge-secondary' }[t] || 'badge-ghost');

  return (
    <div className="space-y-6">
      <div className="flex items-center justify-between">
        <div>
          <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
            <FileText className="w-6 h-6 text-secondary" /> Policy Management
          </h1>
          <p className="text-sm text-base-content/50 mt-1">Manage insurance policies and schemes</p>
        </div>
        <button onClick={startCreate} className="btn btn-secondary btn-sm gap-2">
          <Plus className="w-4 h-4" /> Add Policy
        </button>
      </div>

      {editing && (
        <div className="card bg-secondary/5 border-2 border-secondary/30 shadow-md">
          <div className="card-body">
            <h3 className="card-title text-base">{editing === 'new' ? 'Create New Policy' : 'Edit Policy'}</h3>
            <div className="grid md:grid-cols-2 gap-4 mt-2">
              <div className="form-control">
                <label className="label"><span className="label-text">Policy Name *</span></label>
                <input value={form.name} onChange={(e) => setForm(p => ({ ...p, name: e.target.value }))} className="input input-bordered" placeholder="e.g. PM Fasal Bima Yojana" />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Policy Code *</span></label>
                <input value={form.code} onChange={(e) => setForm(p => ({ ...p, code: e.target.value }))} className="input input-bordered" placeholder="e.g. PMFBY" />
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Type</span></label>
                <select value={form.type} onChange={(e) => setForm(p => ({ ...p, type: e.target.value }))} className="select select-bordered">
                  <option value="crop">Crop</option>
                  <option value="weather">Weather</option>
                  <option value="livestock">Livestock</option>
                  <option value="comprehensive">Comprehensive</option>
                </select>
              </div>
              <div className="form-control">
                <label className="label"><span className="label-text">Premium Rate (%)</span></label>
                <input type="number" value={form.premiumRate} onChange={(e) => setForm(p => ({ ...p, premiumRate: e.target.value }))} className="input input-bordered" placeholder="e.g. 2.0" step="0.1" />
              </div>
              <div className="form-control md:col-span-2">
                <label className="label"><span className="label-text">Description</span></label>
                <textarea value={form.shortDescription} onChange={(e) => setForm(p => ({ ...p, shortDescription: e.target.value }))} className="textarea textarea-bordered" rows="3" placeholder="Brief description..." />
              </div>
              <div className="form-control">
                <label className="label cursor-pointer justify-start gap-3">
                  <input type="checkbox" checked={form.isActive} onChange={(e) => setForm(p => ({ ...p, isActive: e.target.checked }))} className="checkbox checkbox-secondary" />
                  <span className="label-text">Active</span>
                </label>
              </div>
            </div>
            <div className="card-actions justify-end mt-4">
              <button onClick={cancel} className="btn btn-ghost btn-sm gap-1"><X className="w-4 h-4" /> Cancel</button>
              <button onClick={handleSave} disabled={saving} className="btn btn-secondary btn-sm gap-2">
                {saving ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
                {saving ? 'Saving...' : editing === 'new' ? 'Create' : 'Update'}
              </button>
            </div>
          </div>
        </div>
      )}

      {loading ? (
        <div className="flex items-center justify-center py-16">
          <span className="loading loading-spinner loading-lg text-secondary" />
        </div>
      ) : policies.length === 0 ? (
        <div className="text-center py-16">
          <FileText className="w-12 h-12 text-base-content/20 mx-auto mb-3" />
          <h3 className="font-medium text-base-content">No policies yet</h3>
          <button onClick={startCreate} className="btn btn-secondary btn-sm mt-3 gap-2">
            <Plus className="w-4 h-4" /> Create first policy
          </button>
        </div>
      ) : (
        <div className="grid md:grid-cols-2 gap-4">
          {policies.map(p => (
            <div key={p._id} className="card bg-base-100 shadow-sm border border-base-200">
              <div className="card-body p-4">
                <div className="flex items-start justify-between">
                  <div>
                    <h3 className="font-semibold text-base-content">{p.name}</h3>
                    <span className="text-xs text-base-content/40 font-mono">{p.code}</span>
                  </div>
                  <div className="flex items-center gap-1">
                    <span className={`badge badge-sm ${typeBadge(p.type)}`}>{p.type}</span>
                    {!p.isActive && <span className="badge badge-sm badge-error">Inactive</span>}
                  </div>
                </div>
                <p className="text-sm text-base-content/50 line-clamp-2">{p.shortDescription || 'No description'}</p>
                <div className="text-xs text-base-content/40">
                  {p.schemes?.length || 0} schemes · {p.availableStates?.length || 0} states
                  {p.premiumRate ? ` · ${p.premiumRate}% premium` : ''}
                </div>
                <div className="card-actions justify-end mt-2">
                  <button onClick={() => startEdit(p)} className="btn btn-ghost btn-xs gap-1"><Edit3 className="w-3 h-3" /> Edit</button>
                  <button onClick={() => handleDelete(p._id)} className="btn btn-ghost btn-xs text-error gap-1"><Trash2 className="w-3 h-3" /> Delete</button>
                </div>
              </div>
            </div>
          ))}
        </div>
      )}
    </div>
  );
}
