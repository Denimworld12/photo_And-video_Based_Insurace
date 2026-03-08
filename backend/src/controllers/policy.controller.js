const Policy = require('../models/Policy');

// Seed data used when DB is empty or unavailable
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
    shortDescription: 'Weather-based protection with real-time satellite monitoring',
    description: 'Insurance based on weather parameters like rainfall, temperature, humidity etc.',
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
    let policies;
    try {
      policies = await Policy.find({ isActive: true }).select('-__v');
      if (!policies.length) throw new Error('empty');
    } catch {
      policies = SEED_POLICIES;
    }
    res.json({ success: true, insurances: policies, count: policies.length });
  } catch (err) {
    console.error('❌ listPolicies:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch policies' });
  }
};

/* ─── Get Single Policy ─── */
exports.getPolicy = async (req, res) => {
  try {
    const { id } = req.params;
    let policy;
    try {
      policy = await Policy.findById(id);
    } catch {
      policy = SEED_POLICIES.find((p) => p._id === id) || SEED_POLICIES[0];
    }
    if (!policy) {
      policy = SEED_POLICIES.find((p) => p._id === id) || SEED_POLICIES[0];
    }
    res.json({ success: true, insurance: policy });
  } catch (err) {
    console.error('❌ getPolicy:', err);
    res.status(500).json({ success: false, error: 'Failed to fetch policy' });
  }
};

/* ─── Admin: Create Policy ─── */
exports.createPolicy = async (req, res) => {
  try {
    const policy = await Policy.create(req.body);
    res.status(201).json({ success: true, policy });
  } catch (err) {
    console.error('❌ createPolicy:', err);
    res.status(500).json({ success: false, error: 'Failed to create policy' });
  }
};

/* ─── Admin: Update Policy ─── */
exports.updatePolicy = async (req, res) => {
  try {
    const policy = await Policy.findByIdAndUpdate(req.params.id, req.body, { new: true, runValidators: true });
    if (!policy) return res.status(404).json({ success: false, error: 'Policy not found' });
    res.json({ success: true, policy });
  } catch (err) {
    console.error('❌ updatePolicy:', err);
    res.status(500).json({ success: false, error: 'Failed to update policy' });
  }
};

/* ─── Admin: Delete Policy ─── */
exports.deletePolicy = async (req, res) => {
  try {
    const policy = await Policy.findByIdAndUpdate(req.params.id, { isActive: false }, { new: true });
    if (!policy) return res.status(404).json({ success: false, error: 'Policy not found' });
    res.json({ success: true, message: 'Policy deactivated' });
  } catch (err) {
    console.error('❌ deletePolicy:', err);
    res.status(500).json({ success: false, error: 'Failed to delete policy' });
  }
};
