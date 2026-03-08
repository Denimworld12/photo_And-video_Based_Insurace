const Joi = require('joi');

/**
 * Express middleware factory that validates req.body against a Joi schema.
 * @param {Joi.ObjectSchema} schema
 */
const validate = (schema) => (req, res, next) => {
  const { error, value } = schema.validate(req.body, { abortEarly: false, stripUnknown: true });
  if (error) {
    const messages = error.details.map((d) => d.message);
    console.warn(`[VALIDATE] ❌ Validation failed for ${req.method} ${req.path}:`, messages);
    return res.status(400).json({ success: false, error: 'Validation failed', details: messages });
  }
  req.body = value;
  next();
};

/* ───── Reusable Schemas ───── */

const phoneNumberSchema = Joi.string()
  .pattern(/^[6-9]\d{9}$/)
  .required()
  .messages({ 'string.pattern.base': 'Valid 10-digit Indian mobile number required' });

const schemas = {
  sendOtp: Joi.object({ phoneNumber: phoneNumberSchema }),

  verifyOtp: Joi.object({
    phoneNumber: phoneNumberSchema,
    otp: Joi.string().length(6).required(),
  }),

  claimForm: Joi.object({
    insuranceId: Joi.string().required().messages({ 'any.required': 'Insurance/Policy ID is required' }),
    formData: Joi.object({
      state: Joi.string().required().messages({ 'any.required': 'State is required' }),
      season: Joi.string().valid('Kharif', 'Rabi', 'Summer').required().messages({
        'any.required': 'Season is required',
        'any.only': 'Season must be one of: Kharif, Rabi, Summer',
      }),
      scheme: Joi.string().allow('', null).default('').optional(),
      year: Joi.number().integer().min(2020).max(new Date().getFullYear() + 1).default(new Date().getFullYear()).optional(),
      insuranceNumber: Joi.string().allow('', null).default('').optional(),
      cropType: Joi.string().required().messages({ 'any.required': 'Crop type is required' }),
      farmArea: Joi.number().positive().required().messages({
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
      lossDescription: Joi.string().min(10).required().messages({
        'any.required': 'Damage description is required',
        'string.min': 'Damage description must be at least 10 characters',
      }),
    }).required(),
  }),

  completeClaim: Joi.object({
    documentId: Joi.string().required(),
    totalSteps: Joi.number().optional(),
    completedSteps: Joi.number().optional(),
  }),

  adminReview: Joi.object({
    status: Joi.string().valid('approved', 'rejected', 'manual_review').required(),
    reviewNotes: Joi.string().allow('').optional(),
    payoutAmount: Joi.number().min(0).optional(),
  }),

  updateProfile: Joi.object({
    fullName: Joi.string().max(100).optional(),
    email: Joi.string().email().optional(),
    address: Joi.object({
      village: Joi.string().optional(),
      district: Joi.string().optional(),
      state: Joi.string().optional(),
      pincode: Joi.string().optional(),
    }).optional(),
    farmDetails: Joi.object({
      totalArea: Joi.number().optional(),
      crops: Joi.array().items(Joi.string()).optional(),
      landRegistrationNo: Joi.string().optional(),
    }).optional(),
  }),
};

module.exports = { validate, schemas };
