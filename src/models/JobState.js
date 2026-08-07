const mongoose = require('mongoose');

const jobStateSchema = new mongoose.Schema({
  isRunning: { type: Boolean, default: false },
  targetPosts: { type: Number, default: 0 },
  processedPosts: { type: Number, default: 0 },
  durationHours: { type: Number, default: 4 },
  fixedComment: { type: String, default: '𖢘[#فيلق_الهايبرا]𖢘' },
  delayBetweenPostsMs: { type: Number, default: 10000 },
  startedAt: { type: Date, default: null },
  logs: [{
    message: String,
    level: { type: String, enum: ['INFO', 'WARN', 'ERROR'] },
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('JobState', jobStateSchema);
