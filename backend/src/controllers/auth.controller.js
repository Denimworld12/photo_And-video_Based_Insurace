const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');
const { sendOTP, verifyOTP } = require('../services/otp.service');

// Phone number that is granted the admin role. Must be configured explicitly:
// a built-in default would hand admin access to anyone who knows the number.
const ADMIN_PHONE = process.env.ADMIN_PHONE_NUMBER || null;

const generateToken = (user) =>
  jwt.sign(
    { id: user._id || user.id, phoneNumber: user.phoneNumber, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_EXPIRES_IN || '7d' }
  );

/**
 * Role for a phone number. Only the configured admin phone gets 'admin';
 * with no ADMIN_PHONE_NUMBER configured, nobody is auto-promoted.
 */
const determineRole = (phoneNumber) => (ADMIN_PHONE && phoneNumber === ADMIN_PHONE ? 'admin' : 'farmer');

const isDbConnected = () => mongoose.connection.readyState === 1;

/* ─── Send OTP ─── */
exports.sendOtp = async (req, res) => {
  try {
    const { phoneNumber } = req.body;
    const result = await sendOTP(phoneNumber);

    res.json({
      success: true,
      message: 'OTP sent successfully',
      expiresIn: '10 minutes',
      ...(process.env.NODE_ENV !== 'production' && result.devOTP && { devOTP: result.devOTP }),
    });
  } catch (err) {
    console.error('[AUTH:SEND-OTP] Failed to send OTP:', err.message);
    res.status(500).json({ success: false, error: 'Failed to send OTP' });
  }
};

/* ─── Verify OTP ─── */
exports.verifyOtp = async (req, res) => {
  try {
    const { phoneNumber, otp } = req.body;

    const otpResult = await verifyOTP(phoneNumber, otp);
    if (!otpResult.success) {
      return res.status(400).json({ success: false, error: otpResult.error });
    }

    const role = determineRole(phoneNumber);

    // Without a database there is no user record to back the session. The
    // project supports a database-less development mode, so a plain farmer
    // session is still issued there - but never an admin one, and never in
    // production, where a token for a user that does not exist would be a
    // standing authentication bypass.
    if (!isDbConnected()) {
      if (process.env.NODE_ENV === 'production') {
        console.error('[AUTH:VERIFY-OTP] Database not connected, refusing to issue a session');
        return res.status(503).json({
          success: false,
          error: 'Login is temporarily unavailable. Please try again shortly.',
        });
      }

      console.warn(
        `[AUTH:VERIFY-OTP] Database not connected, issuing a development-only farmer session for ${phoneNumber}`
      );
      const temporaryUser = { _id: `temp_${phoneNumber}`, phoneNumber, role: 'farmer', fullName: '' };
      return res.json({
        success: true,
        message: 'Login successful (development mode, no database)',
        degraded: true,
        token: generateToken(temporaryUser),
        user: {
          id: temporaryUser._id,
          phoneNumber,
          role: 'farmer',
          fullName: '',
          isVerified: true,
        },
      });
    }

    let user = await User.findOne({ phoneNumber });
    if (!user) {
      user = await User.create({ phoneNumber, isVerified: true, role });
    } else {
      // Only sync the role when an admin phone is configured, so an unset
      // ADMIN_PHONE_NUMBER never silently demotes an existing admin.
      if (ADMIN_PHONE && user.role !== role) user.role = role;
      user.isVerified = true;
    }

    if (!user.isActive) {
      return res.status(403).json({ success: false, error: 'Account deactivated' });
    }

    user.lastLogin = new Date();
    await user.save();

    const token = generateToken(user);

    res.json({
      success: true,
      message: user.role === 'admin' ? 'Admin login successful' : 'Login successful',
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
    console.error('[AUTH:VERIFY-OTP] Failed to verify OTP:', err.message);
    res.status(500).json({ success: false, error: 'Failed to verify OTP' });
  }
};

/* ─── Get Current User ─── */
exports.me = async (req, res) => {
  res.json({ success: true, user: req.user });
};
