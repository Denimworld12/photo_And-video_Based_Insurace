const jwt = require('jsonwebtoken');
const mongoose = require('mongoose');
const User = require('../models/User');

const isDbConnected = () => mongoose.connection.readyState === 1;

/**
 * Verify JWT token and attach user to req.user.
 *
 * The user record is the source of truth for role and active status. The token
 * payload is only used as a fallback while the database is unreachable, and
 * even then it can never confer the admin role: a signed token outlives a
 * revocation, so privileged access always requires a live record.
 */
const authenticate = async (req, res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (!authHeader || !authHeader.startsWith('Bearer ')) {
      return res.status(401).json({ success: false, error: 'Authentication required' });
    }

    const token = authHeader.split(' ')[1];
    const decoded = jwt.verify(token, process.env.JWT_SECRET);

    if (isDbConnected()) {
      let user;
      try {
        user = await User.findById(decoded.id).select('-__v');
      } catch (dbErr) {
        console.error('[AUTH] User lookup failed:', dbErr.message);
        return res.status(503).json({ success: false, error: 'Service temporarily unavailable' });
      }

      if (!user) {
        return res.status(401).json({ success: false, error: 'Invalid token' });
      }
      if (!user.isActive) {
        return res.status(403).json({ success: false, error: 'Account deactivated' });
      }

      req.user = user;
      return next();
    }

    // Database unreachable: degrade to the token payload, without admin rights.
    if (decoded.role === 'admin') {
      return res.status(503).json({
        success: false,
        error: 'Administrative access is unavailable while the database is unreachable',
      });
    }

    req.user = {
      _id: decoded.id,
      phoneNumber: decoded.phoneNumber,
      role: 'farmer',
      fullName: decoded.fullName || '',
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      return res.status(401).json({ success: false, error: 'Token expired' });
    }
    return res.status(401).json({ success: false, error: 'Invalid token' });
  }
};

/**
 * Optional auth – sets req.user if a valid token is present, but doesn't block.
 */
const optionalAuth = async (req, _res, next) => {
  try {
    const authHeader = req.headers.authorization;
    if (authHeader && authHeader.startsWith('Bearer ')) {
      const token = authHeader.split(' ')[1];
      const decoded = jwt.verify(token, process.env.JWT_SECRET);

      if (isDbConnected()) {
        const user = await User.findById(decoded.id).select('-__v');
        if (user && user.isActive) req.user = user;
      } else if (decoded.role !== 'admin') {
        req.user = { _id: decoded.id, phoneNumber: decoded.phoneNumber, role: 'farmer' };
      }
    }
  } catch {
    // ignore invalid token for optional auth
  }
  next();
};

module.exports = { authenticate, optionalAuth };
