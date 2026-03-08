const mongoose = require('mongoose');

const policySchema = new mongoose.Schema(
  {
    name: { type: String, required: true },
    code: { type: String, required: true, unique: true },
    type: {
      type: String,
      enum: ['crop', 'weather', 'livestock', 'comprehensive'],
      default: 'crop',
    },
    description: { type: String, default: '' },
    shortDescription: { type: String, default: '' },
    imageUrl: { type: String, default: '' },
    schemes: [
      {
        name: String,
        code: String,
        seasons: [String],
        coverage: {
          percentage: { type: Number, default: 100 },
          maxAmount: { type: Number, default: 200000 },
        },
      },
    ],
    availableStates: [String],
    premiumRate: { type: Number, default: 2 }, // percentage
    isActive: { type: Boolean, default: true },
    eligibility: {
      minFarmArea: { type: Number, default: 0 },
      maxFarmArea: { type: Number, default: 1000 },
      allowedCrops: [String],
    },
  },
  { timestamps: true }
);

policySchema.index({ isActive: 1, type: 1 });

const Policy = mongoose.model('Policy', policySchema);
module.exports = Policy;
