import React, { useState, useEffect } from 'react';
import { useAuth } from '../../contexts/AuthContext';
import api from '../../utils/api';
import { User, Mail, Phone, MapPin, Sprout, Edit3, Save, X, Loader2, CheckCircle2 } from 'lucide-react';

export default function Profile() {
  const { user, login } = useAuth();
  const [editing, setEditing] = useState(false);
  const [loading, setLoading] = useState(false);
  const [saveMsg, setSaveMsg] = useState('');
  const [form, setForm] = useState({
    fullName: '', email: '',
    address: { village: '', district: '', state: '', pincode: '' },
    farmDetails: { totalArea: '', primaryCrop: '', soilType: '' },
  });

  useEffect(() => { fetchProfile(); }, []); // eslint-disable-line

  const fetchProfile = async () => {
    try {
      const { data } = await api.get('/api/user/profile');
      if (data.success && data.user) {
        const u = data.user;
        setForm({
          fullName: u.fullName || '',
          email: u.email || '',
          address: { village: u.address?.village || '', district: u.address?.district || '', state: u.address?.state || '', pincode: u.address?.pincode || '' },
          farmDetails: { totalArea: u.farmDetails?.totalArea || '', primaryCrop: u.farmDetails?.primaryCrop || '', soilType: u.farmDetails?.soilType || '' },
        });
      }
    } catch { /* use defaults */ }
  };

  const handleSave = async () => {
    try {
      setLoading(true); setSaveMsg('');
      const { data } = await api.put('/api/user/profile', form);
      if (data.success) {
        setSaveMsg('Profile updated successfully!');
        setEditing(false);
        if (data.user) {
          const token = localStorage.getItem('authToken');
          login(token, data.user);
        }
      }
    } catch (err) {
      setSaveMsg(err.response?.data?.message || 'Failed to update profile.');
    } finally { setLoading(false); }
  };

  const onChange = (section, field, value) => {
    if (section) setForm(p => ({ ...p, [section]: { ...p[section], [field]: value } }));
    else setForm(p => ({ ...p, [field]: value }));
  };

  const Field = ({ label, value, onValueChange, disabled, type = 'text', icon: Icon }) => (
    <div className="form-control">
      <label className="label"><span className="label-text">{label}</span></label>
      <label className="input input-bordered flex items-center gap-2">
        {Icon && <Icon className="w-4 h-4 text-base-content/40" />}
        <input type={type} value={value} onChange={(e) => onValueChange(e.target.value)} disabled={disabled} className="grow" />
      </label>
    </div>
  );

  return (
    <div className="max-w-2xl mx-auto space-y-6">
      {/* Header */}
      <div className="flex items-center justify-between">
        <h1 className="text-2xl font-bold text-base-content flex items-center gap-2">
          <User className="w-6 h-6 text-primary" /> My Profile
        </h1>
        {!editing ? (
          <button onClick={() => setEditing(true)} className="btn btn-primary btn-sm gap-2">
            <Edit3 className="w-4 h-4" /> Edit Profile
          </button>
        ) : (
          <div className="flex gap-2">
            <button onClick={() => { setEditing(false); fetchProfile(); setSaveMsg(''); }} className="btn btn-ghost btn-sm gap-1">
              <X className="w-4 h-4" /> Cancel
            </button>
            <button onClick={handleSave} disabled={loading} className="btn btn-primary btn-sm gap-2">
              {loading ? <Loader2 className="w-4 h-4 animate-spin" /> : <Save className="w-4 h-4" />}
              {loading ? 'Saving...' : 'Save'}
            </button>
          </div>
        )}
      </div>

      {/* Alert */}
      {saveMsg && (
        <div className={`alert ${(saveMsg || '').includes('success') ? 'alert-success' : 'alert-error'}`}>
          {(saveMsg || '').includes('success') ? <CheckCircle2 className="w-4 h-4" /> : <X className="w-4 h-4" />}
          <span>{saveMsg}</span>
        </div>
      )}

      {/* Avatar Card */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <div className="flex items-center gap-4 mb-6">
            <div className="avatar placeholder">
              <div className="bg-primary text-primary-content rounded-2xl w-16">
                <span className="text-2xl">{form.fullName?.[0]?.toUpperCase() || user?.phoneNumber?.slice(-2) || 'U'}</span>
              </div>
            </div>
            <div>
              <p className="font-semibold text-base-content text-lg">{form.fullName || 'Farmer'}</p>
              <p className="text-sm text-base-content/50">+91 {user?.phoneNumber || 'N/A'}</p>
              <span className="badge badge-primary badge-sm mt-1">{user?.role || 'farmer'}</span>
            </div>
          </div>

          <h3 className="font-medium text-base-content mb-3">Personal Details</h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Full Name" value={form.fullName} onValueChange={(v) => onChange(null, 'fullName', v)} disabled={!editing} icon={User} />
            <Field label="Email" value={form.email} onValueChange={(v) => onChange(null, 'email', v)} disabled={!editing} type="email" icon={Mail} />
            <div className="form-control">
              <label className="label"><span className="label-text">Phone Number</span></label>
              <label className="input input-bordered flex items-center gap-2">
                <Phone className="w-4 h-4 text-base-content/40" />
                <input type="text" value={`+91 ${user?.phoneNumber || ''}`} disabled className="grow" />
              </label>
            </div>
          </div>
        </div>
      </div>

      {/* Address */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h3 className="font-medium text-base-content mb-3 flex items-center gap-2">
            <MapPin className="w-4 h-4 text-primary" /> Address
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Village/Town" value={form.address.village} onValueChange={(v) => onChange('address', 'village', v)} disabled={!editing} />
            <Field label="District" value={form.address.district} onValueChange={(v) => onChange('address', 'district', v)} disabled={!editing} />
            <Field label="State" value={form.address.state} onValueChange={(v) => onChange('address', 'state', v)} disabled={!editing} />
            <Field label="Pincode" value={form.address.pincode} onValueChange={(v) => onChange('address', 'pincode', v)} disabled={!editing} />
          </div>
        </div>
      </div>

      {/* Farm Details */}
      <div className="card bg-base-100 shadow-md">
        <div className="card-body">
          <h3 className="font-medium text-base-content mb-3 flex items-center gap-2">
            <Sprout className="w-4 h-4 text-primary" /> Farm Details
          </h3>
          <div className="grid md:grid-cols-2 gap-4">
            <Field label="Total Farm Area (acres)" value={form.farmDetails.totalArea} onValueChange={(v) => onChange('farmDetails', 'totalArea', v)} disabled={!editing} type="number" />
            <Field label="Primary Crop" value={form.farmDetails.primaryCrop} onValueChange={(v) => onChange('farmDetails', 'primaryCrop', v)} disabled={!editing} />
            <Field label="Soil Type" value={form.farmDetails.soilType} onValueChange={(v) => onChange('farmDetails', 'soilType', v)} disabled={!editing} />
          </div>
        </div>
      </div>
    </div>
  );
}
