const mongoose = require('mongoose');

const adminActionSchema = new mongoose.Schema(
  {
    adminId: { type: mongoose.Schema.Types.ObjectId, ref: 'User', required: true },
    action: {
      type: String,
      enum: [
        'approve_claim',
        'reject_claim',
        'request_review',
        'update_policy',
        'create_policy',
        'deactivate_user',
        'activate_user',
        'process_payout',
        'system_config',
      ],
      required: true,
    },
    targetType: { type: String, enum: ['claim', 'user', 'policy', 'system'] },
    targetId: String,
    details: { type: mongoose.Schema.Types.Mixed, default: {} },
    ipAddress: String,
  },
  { timestamps: true }
);

adminActionSchema.index({ adminId: 1, createdAt: -1 });
adminActionSchema.index({ action: 1, createdAt: -1 });

const AdminAction = mongoose.model('AdminAction', adminActionSchema);
module.exports = AdminAction;
