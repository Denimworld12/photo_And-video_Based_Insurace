const mongoose = require('mongoose');

const uploadedImageSchema = new mongoose.Schema({
  stepId: { type: String, required: true },
  originalName: String,
  cloudinaryUrl: String,
  cloudinaryPublicId: String,
  localPath: String,
  fileSize: Number,
  mimeType: String,
  coordinates: {
    lat: Number,
    lon: Number,
    accuracy: Number,
  },
  capturedAt: Date,
  mediaType: { type: String, enum: ['photo', 'video'], default: 'photo' },
});

const claimSchema = new mongoose.Schema(
  {
    documentId: { type: String, required: true, unique: true },
    userId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    policyId: { type: mongoose.Schema.Types.ObjectId, ref: 'Policy' },
    insuranceId: String,

    // Form data
    state: String,
    season: String,
    scheme: String,
    year: Number,
    insuranceNumber: String,
    cropType: String,
    farmArea: Number,
    lossReason: {
      type: String,
      enum: ['drought', 'flood', 'pest', 'disease', 'hail', 'cyclone', 'other'],
    },
    lossDescription: String,

    // Media
    uploadedImages: [uploadedImageSchema],

    // Processing result from Python pipeline
    processingResult: { type: mongoose.Schema.Types.Mixed, default: {} },

    // Status
    status: {
      type: String,
      enum: [
        'draft',
        'submitted',
        'processing',
        'field_verification',
        'approved',
        'rejected',
        'manual_review',
        'payout_pending',
        'payout_complete',
        'disputed',
      ],
      default: 'draft',
    },

    // Admin review
    reviewedBy: { type: mongoose.Schema.Types.ObjectId, ref: 'User' },
    reviewNotes: String,
    reviewedAt: Date,
    rejectionReason: { type: String, default: '' },

    // Resubmission tracking
    resubmittedFrom: { type: String, default: '' },
    resubmissionCount: { type: Number, default: 0 },

    // AI confidence score
    confidenceScore: { type: Number, default: 0 },

    // Payout
    payoutAmount: { type: Number, default: 0 },
    payoutStatus: {
      type: String,
      enum: ['none', 'pending', 'processing', 'completed', 'failed'],
      default: 'none',
    },
    payoutDate: Date,

    submittedAt: Date,
    completedAt: Date,
  },
  { timestamps: true }
);

claimSchema.index({ userId: 1, status: 1 });
claimSchema.index({ status: 1, createdAt: -1 });

const Claim = mongoose.model('Claim', claimSchema);
module.exports = Claim;
