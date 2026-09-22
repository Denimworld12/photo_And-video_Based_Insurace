import React, { useCallback, useEffect, useState } from 'react';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import Modal from '../../components/ui/Modal';
import ConfirmDialog from '../../components/ui/ConfirmDialog';
import { TextField, SelectField, TextAreaField } from '../../components/ui/Field';
import { ErrorState, EmptyState, SkeletonList } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { FileText, Plus, Edit3, Trash2, Save, Loader2 } from 'lucide-react';

const EMPTY_POLICY = {
  name: '',
  code: '',
  type: 'crop',
  shortDescription: '',
  schemes: [],
  availableStates: [],
  premiumRate: '',
  isActive: true,
};

const TYPES = [
  { value: 'crop', label: 'Crop' },
  { value: 'weather', label: 'Weather' },
  { value: 'livestock', label: 'Livestock' },
  { value: 'comprehensive', label: 'Comprehensive' },
];

export default function PolicyManagement() {
  const toast = useToast();
  const [policies, setPolicies] = useState([]);
  const [loading, setLoading] = useState(true);
  const [error, setError] = useState(null);
  const [editing, setEditing] = useState(null); // null | 'new' | policy id
  const [form, setForm] = useState(EMPTY_POLICY);
  const [formErrors, setFormErrors] = useState({});
  const [saving, setSaving] = useState(false);
  const [deleteTarget, setDeleteTarget] = useState(null);
  const [deleting, setDeleting] = useState(false);

  const fetchPolicies = useCallback(async () => {
    try {
      setLoading(true);
      setError(null);
      const { data } = await api.get('/api/insurance/list');
      setPolicies(data.insurances || data.policies || []);
    } catch (err) {
      setError(err.response?.data?.error || 'The policy list could not be loaded.');
      setPolicies([]);
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchPolicies();
  }, [fetchPolicies]);

  const startCreate = () => {
    setForm(EMPTY_POLICY);
    setFormErrors({});
    setEditing('new');
  };

  const startEdit = (p) => {
    setForm({
      name: p.name || '',
      code: p.code || '',
      type: p.type || 'crop',
      shortDescription: p.shortDescription || '',
      schemes: p.schemes || [],
      availableStates: p.availableStates || [],
      premiumRate: p.premiumRate ?? '',
      isActive: p.isActive ?? true,
    });
    setFormErrors({});
    setEditing(p._id);
  };

  const closeEditor = () => {
    setEditing(null);
    setForm(EMPTY_POLICY);
    setFormErrors({});
  };

  const set = (key, value) => {
    setForm((prev) => ({ ...prev, [key]: value }));
    setFormErrors((prev) => ({ ...prev, [key]: '' }));
  };

  const validate = () => {
    const errs = {};
    if (!form.name.trim()) errs.name = 'A policy needs a name farmers will recognise';
    if (!form.code.trim()) errs.code = 'A short code is required, for example PMFBY';
    if (form.premiumRate !== '' && (Number.isNaN(parseFloat(form.premiumRate)) || parseFloat(form.premiumRate) < 0))
      errs.premiumRate = 'Premium rate must be a positive number';
    setFormErrors(errs);
    return Object.keys(errs).length === 0;
  };

  const handleSave = async () => {
    // Was `alert('Name and Code are required')` with no indication of which
    // field was at fault.
    if (!validate()) return;
    try {
      setSaving(true);
      const isNew = editing === 'new';
      const { data } = isNew
        ? await api.post('/api/insurance', form)
        : await api.put(`/api/insurance/${editing}`, form);

      if (data.success) {
        const saved = data.policy || data.insurance;
        setPolicies((prev) => (isNew ? [...prev, saved] : prev.map((p) => (p._id === editing ? saved : p))));
        toast.success(isNew ? `“${form.name}” created.` : `“${form.name}” updated.`);
        closeEditor();
      } else {
        // This branch silently did nothing before — the dialog just sat there.
        toast.error(data.error || data.message || 'The policy could not be saved.');
      }
    } catch (err) {
      toast.error(err.response?.data?.message || err.response?.data?.error || 'The policy could not be saved.');
    } finally {
      setSaving(false);
    }
  };

  const handleDelete = async () => {
    try {
      setDeleting(true);
      await api.delete(`/api/insurance/${deleteTarget._id}`);
      setPolicies((prev) => prev.filter((p) => p._id !== deleteTarget._id));
      toast.success(`“${deleteTarget.name}” deleted.`);
      setDeleteTarget(null);
    } catch (err) {
      toast.error(err.response?.data?.error || 'The policy could not be deleted.');
    } finally {
      setDeleting(false);
    }
  };

  return (
    <div className="page-shell space-y-6">
      <PageHeader
        eyebrow="Administration"
        title="Policies"
        description="The insurance products farmers can file claims against."
        actions={
          <button type="button" onClick={startCreate} className="btn btn-primary">
            <Plus className="h-4 w-4" aria-hidden="true" /> New policy
          </button>
        }
      />

      {loading ? (
        <SkeletonList rows={4} />
      ) : error ? (
        <ErrorState message={error} onRetry={fetchPolicies} />
      ) : policies.length === 0 ? (
        <EmptyState
          icon={FileText}
          title="No policies yet"
          message="Farmers cannot file a claim until at least one policy is published."
          action={
            <button type="button" onClick={startCreate} className="btn btn-primary">
              <Plus className="h-4 w-4" aria-hidden="true" /> Create the first policy
            </button>
          }
        />
      ) : (
        <ul className="grid gap-3 lg:grid-cols-2">
          {policies.map((p) => (
            <li key={p._id} className="flex flex-col rounded-lg border border-bone bg-pure-white p-4">
              <div className="flex items-start justify-between gap-3">
                <div className="min-w-0">
                  <p className="text-body-lg font-medium text-ink">{p.name}</p>
                  <p className="font-mono text-caption text-bark">{p.code}</p>
                </div>
                <div className="flex shrink-0 flex-wrap items-center gap-1.5">
                  <span className="rounded-md border border-bone px-2 py-0.5 text-caption capitalize text-bark">
                    {p.type}
                  </span>
                  {!p.isActive && (
                    <span className="rounded-md border border-saddle bg-saddle/10 px-2 py-0.5 text-caption text-saddle">
                      Not published
                    </span>
                  )}
                </div>
              </div>

              <p className="mt-2 line-clamp-2 flex-1 text-body text-bark">
                {p.shortDescription || 'No description given.'}
              </p>

              <p className="mt-3 text-caption text-bark">
                {p.schemes?.length || 0} scheme{p.schemes?.length === 1 ? '' : 's'} ·{' '}
                {p.availableStates?.length || 0} state{p.availableStates?.length === 1 ? '' : 's'}
                {p.premiumRate ? ` · ${p.premiumRate}% premium` : ''}
              </p>

              <div className="mt-4 flex justify-end gap-2 border-t border-bone pt-3">
                <button type="button" onClick={() => startEdit(p)} className="btn btn-outline btn-sm">
                  <Edit3 className="h-4 w-4" aria-hidden="true" /> Edit
                </button>
                <button
                  type="button"
                  onClick={() => setDeleteTarget(p)}
                  className="btn btn-ghost btn-sm text-saddle"
                >
                  <Trash2 className="h-4 w-4" aria-hidden="true" /> Delete
                </button>
              </div>
            </li>
          ))}
        </ul>
      )}

      {/* The editor used to appear as a panel above the list, which on a phone
          pushed the list off-screen with nothing to say why. */}
      <Modal
        open={Boolean(editing)}
        onClose={closeEditor}
        title={editing === 'new' ? 'New policy' : 'Edit policy'}
        subtitle={editing === 'new' ? undefined : form.code}
        footer={
          <div className="flex flex-col-reverse gap-2 sm:flex-row sm:justify-end">
            <button type="button" onClick={closeEditor} disabled={saving} className="btn btn-outline">
              Cancel
            </button>
            <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary">
              {saving ? (
                <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
              ) : (
                <Save className="h-4 w-4" aria-hidden="true" />
              )}
              {saving ? 'Saving…' : editing === 'new' ? 'Create policy' : 'Save changes'}
            </button>
          </div>
        }
      >
        <div className="space-y-5">
          <div className="grid gap-5 sm:grid-cols-2">
            <TextField
              label="Policy name"
              required
              placeholder="e.g. PM Fasal Bima Yojana"
              value={form.name}
              onChange={(v) => set('name', v)}
              error={formErrors.name}
            />
            <TextField
              label="Policy code"
              required
              placeholder="e.g. PMFBY"
              value={form.code}
              onChange={(v) => set('code', v)}
              error={formErrors.code}
              hint="Short identifier used in claim records."
            />
            <SelectField label="Type" value={form.type} onChange={(v) => set('type', v)} options={TYPES} />
            <TextField
              label="Premium rate (%)"
              type="number"
              step="0.1"
              inputMode="decimal"
              placeholder="e.g. 2.0"
              value={form.premiumRate}
              onChange={(v) => set('premiumRate', v)}
              error={formErrors.premiumRate}
            />
          </div>

          <TextAreaField
            label="Description"
            rows={3}
            placeholder="One or two sentences a farmer will read when choosing this policy."
            value={form.shortDescription}
            onChange={(v) => set('shortDescription', v)}
          />

          <label className="flex cursor-pointer items-start gap-3 rounded-md border border-bone bg-parchment p-3">
            <input
              type="checkbox"
              checked={form.isActive}
              onChange={(e) => set('isActive', e.target.checked)}
              className="checkbox checkbox-sm mt-0.5"
            />
            <span className="min-w-0">
              <span className="block text-body font-medium text-ink">Published</span>
              <span className="block text-body text-bark">
                Published policies are visible to farmers and can be claimed against.
              </span>
            </span>
          </label>
        </div>
      </Modal>

      {/* window.confirm('Delete this policy?') never said which policy. */}
      <ConfirmDialog
        open={Boolean(deleteTarget)}
        busy={deleting}
        onCancel={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        tone="danger"
        title="Delete this policy?"
        description="Farmers will no longer be able to file claims against it. This cannot be undone from the admin portal."
        summary={
          deleteTarget
            ? [
                { label: 'Policy', value: deleteTarget.name },
                { label: 'Code', value: deleteTarget.code },
                { label: 'Type', value: deleteTarget.type },
              ]
            : []
        }
        confirmLabel="Delete policy"
      />
    </div>
  );
}
