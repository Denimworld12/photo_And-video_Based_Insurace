const User = require('../models/User');

/* ─── Get Profile ─── */
exports.getProfile = async (req, res) => {
  try {
    let user;
    try {
      user = await User.findById(req.user._id).select('-__v');
    } catch {
      user = req.user;
    }
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to fetch profile' });
  }
};

/* ─── Update Profile ─── */
exports.updateProfile = async (req, res) => {
  try {
    const updates = req.body;
    const user = await User.findByIdAndUpdate(req.user._id, updates, { new: true, runValidators: true }).select('-__v');
    if (!user) return res.status(404).json({ success: false, error: 'User not found' });
    res.json({ success: true, user });
  } catch (err) {
    res.status(500).json({ success: false, error: 'Failed to update profile' });
  }
};
