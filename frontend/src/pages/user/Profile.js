import React, { useCallback, useEffect, useState } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import PageHeader from '../../components/ui/PageHeader';
import { TextField, ReadOnlyField } from '../../components/ui/Field';
import { LoadingState, ErrorState } from '../../components/ui/States';
import { useToast } from '../../components/ui/Toast';
import { User, Mail, Phone, MapPin, Sprout, Edit3, Save, X, Loader2 } from 'lucide-react';

const EMPTY = {
  fullName: '',
  email: '',
  address: { village: '', district: '', state: '', pincode: '' },
  farmDetails: { totalArea: '', primaryCrop: '', soilType: '' },
};

const FARM_FIELDS = [
  { key: 'totalArea', label: 'Total farm area (acres)', type: 'number', inputMode: 'decimal' },
  { key: 'primaryCrop', label: 'Primary crop' },
  { key: 'soilType', label: 'Soil type' },
];

export default function Profile() {
  const { user, updateUser } = useAuth();
  const toast = useToast();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(true);
  const [loadError, setLoadError] = useState('');
  const [saving, setSaving] = useState(false);
  const [form, setForm] = useState(EMPTY);
  const [errors, setErrors] = useState({});

  const fetchProfile = useCallback(async () => {
    try {
      setLoading(true);
      setLoadError('');
      const { data } = await api.get('/api/user/profile');
      if (data.success && data.user) {
        const u = data.user;
        setForm({
          fullName: u.fullName || '',
          email: u.email || '',
          address: {
            village: u.address?.village || '',
            district: u.address?.district || '',
            state: u.address?.state || '',
            pincode: u.address?.pincode || '',
          },
          farmDetails: {
            totalArea: u.farmDetails?.totalArea ?? '',
            primaryCrop: u.farmDetails?.primaryCrop || '',
            soilType: u.farmDetails?.soilType || '',
          },
        });
      }
    } catch (err) {
      setLoadError(err.response?.data?.error || 'We could not load your profile. Check your connection and try again.');
    } finally {
      setLoading(false);
    }
  }, []);

  useEffect(() => {
    fetchProfile();
  }, [fetchProfile]);

  const onChange = (section, field, value) => {
    setErrors((prev) => ({ ...prev, [field]: '' }));
    if (section) setForm((prev) => ({ ...prev, [section]: { ...prev[section], [field]: value } }));
    else setForm((prev) => ({ ...prev, [field]: value }));
  };

  const validate = () => {
    const next = {};
    if (!form.fullName.trim()) next.fullName = 'Enter your name as it appears on your policy';
    if (form.email && !/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(form.email)) next.email = 'That does not look like an email address';
    if (form.address.pincode && !/^\d{6}$/.test(form.address.pincode)) next.pincode = 'A pincode is 6 digits';
    if (form.farmDetails.totalArea && parseFloat(form.farmDetails.totalArea) < 0)
      next.totalArea = 'Farm area cannot be negative';
    setErrors(next);
    return Object.keys(next).length === 0;
  };

  /**
   * Every optional field is sent, blank or not. The backend reads an empty
   * string as "clear this" and removes the stored value, so a farmer who
   * deletes their email really does delete it rather than being told it saved.
   */
  const buildPayload = () => {
    const trimAll = (obj) =>
      Object.fromEntries(Object.entries(obj).map(([key, value]) => [key, String(value ?? '').trim()]));

    const farmDetails = trimAll(form.farmDetails);
    if (farmDetails.totalArea) farmDetails.totalArea = parseFloat(farmDetails.totalArea);

    return {
      fullName: form.fullName.trim(),
      email: form.email.trim(),
      address: trimAll(form.address),
      farmDetails,
    };
  };

  const handleSave = async () => {
    if (!validate()) return;
    try {
      setSaving(true);
      const { data } = await api.put('/api/user/profile', buildPayload());
      if (data.success) {
        // Was calling login(token, user) to refresh the cached profile, which
        // re-ran the whole sign-in path just to change a name.
        if (data.user) updateUser(data.user);
        setEditing(false);
        toast.success('Profile saved.');
      } else {
        toast.error(data.error || 'We could not save your profile. Try again.');
      }
    } catch (err) {
      const body = err.response?.data;
      toast.error(
        body?.details?.join('. ') || body?.error || 'We could not save your profile. Try again in a moment.'
      );
    } finally {
      setSaving(false);
    }
  };

  const cancelEdit = () => {
    setEditing(false);
    setErrors({});
    fetchProfile();
  };

  if (loading) return <LoadingState label="Loading your profile…" />;
  if (loadError) return <ErrorState message={loadError} onRetry={fetchProfile} />;

  const initial = (form.fullName?.[0] || user?.phoneNumber?.slice(-1) || 'F').toUpperCase();

  return (
    <div className="page-shell max-w-3xl space-y-6">
      <PageHeader
        eyebrow="Account"
        title="My profile"
        description="Keep these details current — they are used to verify and pay your claims."
        actions={
          editing ? (
            <>
              <button type="button" onClick={cancelEdit} disabled={saving} className="btn btn-outline btn-sm">
                <X className="h-4 w-4" aria-hidden="true" /> Cancel
              </button>
              <button type="button" onClick={handleSave} disabled={saving} className="btn btn-primary btn-sm">
                {saving ? (
                  <Loader2 className="h-4 w-4 animate-spin" aria-hidden="true" />
                ) : (
                  <Save className="h-4 w-4" aria-hidden="true" />
                )}
                {saving ? 'Saving…' : 'Save changes'}
              </button>
            </>
          ) : (
            <button type="button" onClick={() => setEditing(true)} className="btn btn-primary btn-sm">
              <Edit3 className="h-4 w-4" aria-hidden="true" /> Edit profile
            </button>
          )
        }
      />

      <section className="rounded-lg border border-bone bg-pure-white p-5 sm:p-6">
        <div className="flex items-center gap-4 border-b border-bone pb-5">
          <span
            aria-hidden="true"
            className="flex h-14 w-14 shrink-0 items-center justify-center rounded-lg bg-honey-amber/25 text-heading-sm text-saddle"
          >
            {initial}
          </span>
          <div className="min-w-0">
            <p className="truncate text-body-lg font-medium text-ink">{form.fullName || 'Farmer'}</p>
            <p className="text-body text-bark">+91 {user?.phoneNumber || 'Not on file'}</p>
            <p className="eyebrow mt-0.5">{user?.role === 'admin' ? 'Administrator' : 'Farmer'}</p>
          </div>
        </div>

        <h2 className="eyebrow mt-5">Personal details</h2>
        <div className="mt-3 grid gap-5 sm:grid-cols-2">
          {editing ? (
            <>
              <TextField
                label="Full name"
                required
                icon={User}
                value={form.fullName}
                onChange={(v) => onChange(null, 'fullName', v)}
                error={errors.fullName}
              />
              <TextField
                label="Email"
                type="email"
                icon={Mail}
                autoComplete="email"
                value={form.email}
                onChange={(v) => onChange(null, 'email', v)}
                error={errors.email}
                hint="Optional — used for claim receipts."
              />
            </>
          ) : (
            <>
              <ReadOnlyField label="Full name" icon={User} value={form.fullName} />
              <ReadOnlyField label="Email" icon={Mail} value={form.email} />
            </>
          )}
          {/* The phone number is the account identity and cannot be edited
              here. It used to render as a disabled text input, which reads as
              a field the user simply failed to focus. */}
          <ReadOnlyField label="Mobile number" icon={Phone} value={`+91 ${user?.phoneNumber || ''}`} />
        </div>
      </section>

      <section className="rounded-lg border border-bone bg-pure-white p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-subheading text-ink">
          <MapPin className="h-4 w-4 text-bark" aria-hidden="true" /> Address
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {[
            { key: 'village', label: 'Village or town' },
            { key: 'district', label: 'District' },
            { key: 'state', label: 'State' },
            { key: 'pincode', label: 'Pincode', inputMode: 'numeric', maxLength: 6 },
          ].map((f) =>
            editing ? (
              <TextField
                key={f.key}
                label={f.label}
                inputMode={f.inputMode}
                maxLength={f.maxLength}
                value={form.address[f.key]}
                onChange={(v) => onChange('address', f.key, v)}
                error={errors[f.key]}
              />
            ) : (
              <ReadOnlyField key={f.key} label={f.label} value={form.address[f.key]} />
            )
          )}
        </div>
      </section>

      <section className="rounded-lg border border-bone bg-pure-white p-5 sm:p-6">
        <h2 className="flex items-center gap-2 text-subheading text-ink">
          <Sprout className="h-4 w-4 text-bark" aria-hidden="true" /> Farm details
        </h2>
        <div className="mt-4 grid gap-5 sm:grid-cols-2">
          {FARM_FIELDS.map((f) =>
            editing ? (
              <TextField
                key={f.key}
                label={f.label}
                type={f.type}
                inputMode={f.inputMode}
                value={form.farmDetails[f.key]}
                onChange={(v) => onChange('farmDetails', f.key, v)}
                error={errors[f.key]}
              />
            ) : (
              <ReadOnlyField key={f.key} label={f.label} value={form.farmDetails[f.key]} />
            )
          )}
        </div>
      </section>
    </div>
  );
}
