const mongoose = require('mongoose');
const bcrypt = require('bcryptjs');

const userSchema = new mongoose.Schema(
  {
    phoneNumber: {
      type: String,
      required: true,
      unique: true,
      match: [/^[6-9]\d{9}$/, 'Valid 10-digit Indian mobile number required'],
    },
    fullName: { type: String, default: '' },
    email: { type: String, default: '' },
    avatarUrl: { type: String, default: '' },
    role: {
      type: String,
      enum: ['farmer', 'admin'],
      default: 'farmer',
    },
    isVerified: { type: Boolean, default: false },
    isActive: { type: Boolean, default: true },
    address: {
      village: String,
      district: String,
      state: String,
      pincode: String,
    },
    farmDetails: {
      totalArea: Number, // in acres
      crops: [String],
      landRegistrationNo: String,
    },
    lastLogin: Date,
  },
  { timestamps: true }
);

// Index for fast look-ups
userSchema.index({ role: 1, isActive: 1 });

const User = mongoose.model('User', userSchema);
module.exports = User;
