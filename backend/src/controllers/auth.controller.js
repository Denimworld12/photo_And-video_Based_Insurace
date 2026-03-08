const jwt = require('jsonwebtoken');
const User = require('../models/User');
const { sendOTP, verifyOTP } = require('../services/otp.service');

// Admin phone number from env (default: 6392398104)
const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || '6392398104';

const generateToken = (user) =>
  jwt.sign(
    { id: user._id || user.id, phoneNumber: user.phoneNumber, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

/**
 * Determine role based on phone number.
 */
const determineRole = (phoneNumber) => {
  return phoneNumber === ADMIN_PHONE ? 'admin' : 'farmer';
};

/* ─── Send OTP ─── */
exports.sendOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const result = await sendOTP(phoneNumber);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      expiresIn: '10 minutes',
      ...(process.env.NODE_ENV === 'development' && { devOTP: result.devOTP }),
    });
  } catch (err) {
    console.error('❌ sendOtp error:', err);
    res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
};

/* ─── Verify OTP ─── */
exports.verifyOtp = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    // Verify OTP (mock mode accepts any input)
    const otpResult = await verifyOTP(phoneNumber, otp);
    if (!otpResult.success) {
      return res.status(400).json({ success: false, error: otpResult.error });
    }

    // Determine role by phone number
    const role = determineRole(phoneNumber);

    // Find or create user
    let user;
    try {
      user = await User.findOne({ phoneNumber });
      if (!user) {
        user = await User.create({
          phoneNumber,
          isVerified: true,
          role,
        });
      } else if (user.role !== role) {
        user.role = role;
        await user.save();
      }
      user.lastLogin = new Date();
      user.isVerified = true;
      await user.save();
    } catch {
      // DB unavailable – create virtual user
      user = {
        _id: `temp_${Date.now()}`,
        id: `temp_${Date.now()}`,
        phoneNumber,
        role,
        isVerified: true,
        fullName: '',
      };
    }

    const token = generateToken(user);

    res.json({
      success: true,
      message: role === 'admin' ? 'Admin login successful' : 'Login successful',
      token,
      user: {
        id: user._id,
        phoneNumber: user.phoneNumber,
        role: user.role,
        fullName: user.fullName || '',
        isVerified: true,
      },
    });
  } catch (err) {
    console.error('❌ verifyOtp error:', err);
    res.status(500).json({ success: false, error: 'Failed to verify OTP' });
  }
};

/* ─── Get Current User ─── */
exports.me = async (req, res) => {
  res.json({ success: true, user: req.user });
};
