const mongoose = require('mongoose');

const cookieSchema = new mongoose.Schema({
  name: { type: String, required: true, unique: true },
  data: { type: Array, required: true },
  status: { 
    type: String, 
    enum: ['ACTIVE', 'EXPIRED', 'COOLDOWN'], 
    default: 'ACTIVE' 
  },
  failureReason: { type: String, default: null },
  successCount: { type: Number, default: 0 },
  lastUsedAt: { type: Date, default: null },
  cooldownUntil: { type: Date, default: null }
}, { timestamps: true });

module.exports = mongoose.model('Cookie', cookieSchema);
