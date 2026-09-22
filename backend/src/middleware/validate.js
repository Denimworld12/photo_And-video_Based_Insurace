const Joi = require('joi');
const mongoose = require('mongoose');
const fs = require('fs');

/**
 * Multer writes an upload to disk before this middleware runs, so a rejected
 * request would otherwise leave the file behind for good.
 */
const removeOrphanedUploads = (req) => {
  const files = req.file ? [req.file] : Array.isArray(req.files) ? req.files : [];
  for (const file of files) {
    if (!file?.path) continue;
    fs.unlink(file.path, (err) => {
      if (err && err.code !== 'ENOENT') {
        console.error(`[VALIDATE] Failed to remove rejected upload ${file.path}:`, err.message);
      }
    });
  }
};

/**
 * Express middleware factory that validates req.body against a Joi schema.
 * @param {Joi.ObjectSchema} schema
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const messages = error.details.map((d) => d.message);
    console.warn(`[VALIDATE] Validation failed for ${req.method} ${req.path}:`, messages);
    removeOrphanedUploads(req);
    return res.status(400).json({ success: false, error: 'Validation failed', details: messages });
  }
  req.body = value;
  next();
};

/**
 * Validate a route parameter that must be a MongoDB ObjectId.
 * Without this an id like "abc" reaches Mongoose and surfaces as a 500, which
 * reads as a server fault rather than a bad request.
 */
const validateObjectId = (paramName = 'id') => (req, res, next) => {
  if (!mongoose.isValidObjectId(req.params[paramName])) {
    removeOrphanedUploads(req);
    return res.status(400).json({ success: false, error: `Invalid ${paramName}` });
  }
  next();
};

/* ───── Reusable Schemas ───── */

const phoneNumberSchema = Joi.string()
  .pattern(/^[6-9]\d{9}$/)
  .required()
  .messages({ 'string.pattern.base': 'Valid 10-digit Indian mobile number required' });

const coverageSchema = Joi.object({
  percentage: Joi.number().min(0).max(100).optional(),
  maxAmount: Joi.number().positive().optional(),
});

const schemeSchema = Joi.object({
  name: Joi.string().max(200).required(),
  code: Joi.string().max(50).required(),
  seasons: Joi.array().items(Joi.string().valid('Kharif', 'Rabi', 'Summer')).optional(),
  coverage: coverageSchema.optional(),
});

const schemas = {
  sendOtp: Joi.object({ phoneNumber: phoneNumberSchema }),

  verifyOtp: Joi.object({
    phoneNumber: phoneNumberSchema,
    otp: Joi.string()
      .pattern(/^\d{6}$/)
      .required()
      .messages({ 'string.pattern.base': 'OTP must be 6 digits' }),
  }),

  claimForm: Joi.object({
    insuranceId: Joi.string().max(100).required().messages({ 'any.required': 'Insurance/Policy ID is required' }),
    formData: Joi.object({
      state: Joi.string().max(100).required().messages({ 'any.required': 'State is required' }),
      season: Joi.string().valid('Kharif', 'Rabi', 'Summer').required().messages({
        'any.required': 'Season is required',
        'any.only': 'Season must be one of: Kharif, Rabi, Summer',
      }),
      scheme: Joi.string().max(100).allow('', null).default('').optional(),
      year: Joi.number().integer().min(2020).max(new Date().getFullYear() + 1).default(new Date().getFullYear()).optional(),
      insuranceNumber: Joi.string().max(100).allow('', null).default('').optional(),
      cropType: Joi.string().max(100).required().messages({ 'any.required': 'Crop type is required' }),
      farmArea: Joi.number().positive().max(100000).required().messages({
        'any.required': 'Farm area is required',
        'number.positive': 'Farm area must be a positive number',
      }),
      lossReason: Joi.string()
        .valid('drought', 'flood', 'pest', 'disease', 'hail', 'cyclone', 'other')
        .required()
        .messages({
          'any.required': 'Loss reason is required',
          'any.only': 'Invalid loss reason',
        }),
      lossDescription: Joi.string().min(10).max(5000).required().messages({
        'any.required': 'Damage description is required',
        'string.min': 'Damage description must be at least 10 characters',
      }),
    }).required(),
  }),

  /**
   * Multipart fields that accompany an evidence upload. Everything arrives as a
   * string from multer, so coordinates are coerced and range-checked here rather
   * than being trusted and stored as NaN. The media type is not among them: it
   * is derived from the uploaded file's own verified type.
   */
  claimUpload: Joi.object({
    parcel_id: Joi.string().max(100).required().messages({ 'any.required': 'parcel_id (claim document ID) is required' }),
    step_id: Joi.string().max(100).required().messages({ 'any.required': 'step_id is required' }),
    lat: Joi.number().min(-90).max(90).required().messages({
      'any.required': 'Latitude is required',
      'number.base': 'Latitude must be a number',
    }),
    lon: Joi.number().min(-180).max(180).required().messages({
      'any.required': 'Longitude is required',
      'number.base': 'Longitude must be a number',
    }),
    client_ts: Joi.number().integer().min(0).optional(),
  }),

  completeClaim: Joi.object({
    documentId: Joi.string().max(100).required(),
    totalSteps: Joi.number().optional(),
    completedSteps: Joi.number().optional(),
  }),

  adminReview: Joi.object({
    status: Joi.string().valid('approved', 'rejected', 'manual_review').required(),
    reviewNotes: Joi.string().max(5000).allow('').optional(),
    payoutAmount: Joi.number().min(0).max(100000000).optional(),
  }),

  updateProfile: Joi.object({
    fullName: Joi.string().max(100).optional(),
    email: Joi.string().email().allow('').optional(),
    address: Joi.object({
      village: Joi.string().max(100).optional(),
      district: Joi.string().max(100).optional(),
      state: Joi.string().max(100).optional(),
      pincode: Joi.string()
        .pattern(/^\d{6}$/)
        .optional()
        .messages({ 'string.pattern.base': 'Pincode must be 6 digits' }),
    }).optional(),
    farmDetails: Joi.object({
      totalArea: Joi.number().positive().max(100000).optional(),
      crops: Joi.array().items(Joi.string().max(100)).max(50).optional(),
      landRegistrationNo: Joi.string().max(100).optional(),
    }).optional(),
  }),

  createPolicy: Joi.object({
    name: Joi.string().max(200).required(),
    code: Joi.string().max(50).required(),
    type: Joi.string().valid('crop', 'weather', 'livestock', 'comprehensive').optional(),
    description: Joi.string().max(5000).allow('').optional(),
    shortDescription: Joi.string().max(500).allow('').optional(),
    imageUrl: Joi.string().max(500).allow('').optional(),
    schemes: Joi.array().items(schemeSchema).optional(),
    availableStates: Joi.array().items(Joi.string().max(100)).optional(),
    premiumRate: Joi.number().min(0).max(100).optional(),
    isActive: Joi.boolean().optional(),
    eligibility: Joi.object({
      minFarmArea: Joi.number().min(0).optional(),
      maxFarmArea: Joi.number().positive().optional(),
      allowedCrops: Joi.array().items(Joi.string().max(100)).optional(),
    }).optional(),
  }),
};

// An update carries the same fields, none of them mandatory, and must not be empty.
schemas.updatePolicy = schemas.createPolicy.fork(['name', 'code'], (s) => s.optional()).min(1);

module.exports = { validate, validateObjectId, removeOrphanedUploads, schemas };
