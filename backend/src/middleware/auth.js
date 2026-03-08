const jwt = require('jsonwebtoken');
const User = require('../models/User');

/**
 * Verify JWT token and attach user to req.user
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    // Try DB look-up first; fall back to decoded payload if DB is down
    let user;
    try {
      user = await User.findById(decoded.id).select('-__v');
    } catch {
      user = null;
    }

    if (user) {
      if (!user.isActive) {
        return res.status(403).json({ success: false, error: 'Account deactivated' });
      }
      req.user = user;
    } else {
      // Graceful fallback when running without DB
      req.user = {
        _id: decoded.id,
        phoneNumber: decoded.phoneNumber,
        role: decoded.role || 'farmer',
        fullName: decoded.fullName || '',
      };
    }

    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

/**
 * Optional auth – sets req.user if token present, but doesn't block
 */
const optionalAuth = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      try {
        req.user = await User.findById(decoded.id).select('-__v');
      } catch {
        req.user = { _id: decoded.id, phoneNumber: decoded.phoneNumber, role: decoded.role };
      }
    }
  } catch {
    // ignore invalid token for optional auth
  }
  next();
};

module.exports = { authenticate, optionalAuth };
