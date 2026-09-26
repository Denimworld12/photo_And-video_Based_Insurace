const mongoose = require('mongoose');
const Policy = require('../models/Policy');
const AdminAction = require('../models/AdminAction');

const isDbConnected = () => mongoose.connection.readyState === 1;

// Seed data used when the database is unavailable or holds no policies, so the
// farmer portal still has something to show during local development.
const SEED_POLICIES = [
  {
    _id: '1',
    name: 'Pradhan Mantri Fasal Bima Yojana',
    code: 'PMFBY',
    type: 'crop',
    shortDescription: 'Government crop insurance with comprehensive coverage',
    description: 'Comprehensive crop insurance scheme by the Government of India providing financial support to farmers suffering crop loss/damage.',
    imageUrl: '/images/pmfby.jpg',
    schemes: [{ name: 'PMFBY Basic Coverage', code: 'PMFBY001', seasons: ['Kharif', 'Rabi', 'Summer'], coverage: { percentage: 100, maxAmount: 200000 } }],
    availableStates: ['Maharashtra', 'Punjab', 'Haryana', 'Uttar Pradesh', 'Madhya Pradesh', 'Rajasthan', 'Gujarat', 'Karnataka'],
    premiumRate: 2,
    isActive: true,
  },
  {
    _id: '2',
    name: 'Weather Based Crop Insurance Scheme',
    code: 'WBCIS',
    type: 'weather',
    shortDescription: 'Weather-based protection, with claims verified from your field photos',
    description: 'Insurance based on weather parameters like rainfall, temperature and humidity. File a claim with photo and video evidence from your field; computer-vision analysis checks the damage and the weather recorded for your location.',
    imageUrl: '/images/wbcis.jpg',
    schemes: [{ name: 'WBCIS Weather Shield', code: 'WBCI001', seasons: ['Kharif', 'Rabi'], coverage: { percentage: 80, maxAmount: 150000 } }],
    availableStates: ['Gujarat', 'Karnataka', 'Tamil Nadu', 'Andhra Pradesh', 'Telangana'],
    premiumRate: 3,
    isActive: true,
  },
  {
    _id: '3',
    name: 'Restructured Weather Based Crop Insurance',
    code: 'RWBCIS',
    type: 'comprehensive',
    shortDescription: 'Restructured scheme with improved coverage and faster settlements',
    description: 'A restructured version of WBCIS with better payout mechanisms.',
    imageUrl: '/images/rwbcis.jpg',
    schemes: [{ name: 'RWBCIS Comprehensive', code: 'RWBC001', seasons: ['Kharif', 'Rabi', 'Summer'], coverage: { percentage: 90, maxAmount: 250000 } }],
    availableStates: ['Bihar', 'Odisha', 'West Bengal', 'Jharkhand', 'Chhattisgarh'],
    premiumRate: 2.5,
    isActive: true,
  },
];

/* ─── List Policies ─── */
exports.listPolicies = async (req, res) => {
  try {
    let policies = [];
    let source = 'database';

    if (isDbConnected()) {
      policies = await Policy.find({ isActive: true }).select('-__v');
    } else {
      console.warn('[POLICY:LIST] Database not connected, serving seed policies');
    }

    if (!policies.length) {
      policies = SEED_POLICIES;
      source = 'seed';
    }

    res.json({ success: true, insurances: policies, count: policies.length, source });
  } catch (err) {
    console.error('[POLICY:LIST] Failed to fetch policies:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch policies' });
  }
};

/* ─── Admin: List Policies by Publication State ─── */
// The public list only ever shows published policies, so an unpublished one
// had no way back into view. `?status=inactive` lists those so an admin can
// republish them; `active` (the default) matches what farmers see, seed
// policies included; `all` returns every stored policy.
const ADMIN_POLICY_FILTERS = { active: { isActive: true }, inactive: { isActive: false }, all: {} };

exports.listPoliciesForAdmin = async (req, res) => {
  try {
    const status = req.query.status || 'active';
    const filter = ADMIN_POLICY_FILTERS[status];
    if (!filter) {
      return res.status(400).json({ success: false, error: 'status must be one of: active, inactive, all' });
    }
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'Policy administration needs the database' });
    }

    const policies = await Policy.find(filter).sort({ createdAt: -1 }).select('-__v');
    const counts = {
      active: await Policy.countDocuments({ isActive: true }),
      inactive: await Policy.countDocuments({ isActive: false }),
    };

    // Farmers are served the seed policies while nothing is published, so the
    // admin view says so rather than claiming no policy is on offer.
    if (status === 'active' && !policies.length) {
      return res.json({ success: true, policies: SEED_POLICIES, counts, source: 'seed' });
    }

    res.json({ success: true, policies, counts, source: 'database' });
  } catch (err) {
    console.error('[POLICY:ADMIN-LIST] Failed to fetch policies:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch policies' });
  }
};

/* ─── Get Single Policy ─── */
exports.getPolicy = async (req, res) => {
  try {
    const { id } = req.params;

    if (isDbConnected() && mongoose.isValidObjectId(id)) {
      const policy = await Policy.findById(id).select('-__v');
      if (policy) return res.json({ success: true, insurance: policy });
    }

    // A seed id (or a code) is still resolvable; anything else is genuinely
    // missing. Returning an arbitrary policy for an unknown id would quote the
    // wrong coverage back to the farmer.
    const seed = SEED_POLICIES.find((p) => p._id === id || p.code === String(id).toUpperCase());
    if (seed) return res.json({ success: true, insurance: seed, source: 'seed' });

    res.status(404).json({ success: false, error: 'Policy not found' });
  } catch (err) {
    console.error('[POLICY:GET] Failed to fetch policy:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch policy' });
  }
};

/* ─── Admin: Create Policy ─── */
exports.createPolicy = async (req, res) => {
  try {
    const policy = await Policy.create({ ...req.body, code: String(req.body.code).toUpperCase() });

    await AdminAction.create({
      adminId: req.user._id,
      action: 'create_policy',
      targetType: 'policy',
      targetId: policy._id.toString(),
      details: { code: policy.code, name: policy.name },
      ipAddress: req.ip,
    });

    res.status(201).json({ success: true, policy });
  } catch (err) {
    console.error('[POLICY:CREATE] Failed to create policy:', err.message);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'A policy with that code already exists' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: 'Invalid policy details' });
    }
    res.status(500).json({ success: false, error: 'Failed to create policy' });
  }
};

/* ─── Admin: Update Policy ─── */
exports.updatePolicy = async (req, res) => {
  try {
    const updates = { ...req.body };
    if (updates.code) updates.code = String(updates.code).toUpperCase();

    const policy = await Policy.findByIdAndUpdate(req.params.id, updates, { new: true, runValidators: true });
    if (!policy) return res.status(404).json({ success: false, error: 'Policy not found' });

    await AdminAction.create({
      adminId: req.user._id,
      action: 'update_policy',
      targetType: 'policy',
      targetId: policy._id.toString(),
      details: { fields: Object.keys(updates) },
      ipAddress: req.ip,
    });

    res.json({ success: true, policy });
  } catch (err) {
    console.error('[POLICY:UPDATE] Failed to update policy:', err.message);
    if (err.code === 11000) {
      return res.status(409).json({ success: false, error: 'A policy with that code already exists' });
    }
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: 'Invalid policy details' });
    }
    res.status(500).json({ success: false, error: 'Failed to update policy' });
  }
};

/* ─── Admin: Delete (deactivate) Policy ─── */
exports.deletePolicy = async (req, res) => {
  try {
    const policy = await Policy.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!policy) return res.status(404).json({ success: false, error: 'Policy not found' });

    await AdminAction.create({
      adminId: req.user._id,
      action: 'update_policy',
      targetType: 'policy',
      targetId: policy._id.toString(),
      details: { deactivated: true, code: policy.code },
      ipAddress: req.ip,
    });

    res.json({ success: true, message: 'Policy deactivated' });
  } catch (err) {
    console.error('[POLICY:DELETE] Failed to deactivate policy:', err.message);
    res.status(500).json({ success: false, error: 'Failed to delete policy' });
  }
};

module.exports.SEED_POLICIES = SEED_POLICIES;
