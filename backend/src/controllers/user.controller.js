const mongoose = require('mongoose');
const User = require('../models/User');

const isDbConnected = () => mongoose.connection.readyState === 1;

/* ─── Get Profile ─── */
exports.getProfile = async (req, res) => {
  try {
    if (!isDbConnected()) {
      // req.user came from the token; return what is known rather than failing.
      return res.json({ success: true, user: req.user, degraded: true });
    }

    const user = await User.findById(req.user._id).select('-__v');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    res.json({ success: true, user });
  } catch (err) {
    console.error('[USER:PROFILE] Failed to fetch profile:', err.message);
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

/* ─── Update Profile ─── */
exports.updateProfile = async (req, res) => {
  try {
    if (!isDbConnected()) {
      return res.status(503).json({ success: false, error: 'Profile updates are temporarily unavailable' });
    }

    // req.body is already narrowed by schemas.updateProfile, so role, isActive
    // and phoneNumber cannot be set from here.
    const user = await User.findByIdAndUpdate(req.user._id, req.body, {
      new: true,
      runValidators: true,
    }).select('-__v');

    if (!user) return res.status(404).json({ success: false, error: 'User not found' });

    res.json({ success: true, user });
  } catch (err) {
    console.error('[USER:PROFILE] Failed to update profile:', err.message);
    if (err.name === 'ValidationError') {
      return res.status(400).json({ success: false, error: 'Invalid profile details' });
    }
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};
