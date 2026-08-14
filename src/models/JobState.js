// src/models/JobState.js
const mongoose = require('mongoose');

const LogSchema = new mongoose.Schema({
  timestamp: { type: Date, default: Date.now },
  cookieName: String,
  postUrl: String,
  commentText: String,
  status: { type: String, enum: ['SUCCESS', 'FAILED'], default: 'SUCCESS' },
  errorDetails: String
});

const JobStateSchema = new mongoose.Schema({
  isRunning: { type: Boolean, default: false },
  targetPosts: { type: Number, default: 100 },
  processedPosts: { type: Number, default: 0 },
  durationHours: { type: Number, default: 4 },
  fixedComment: { type: String, default: '𖢘[#فيلق_الهايبرا]𖢘' },
  delayBetweenPostsMs: { type: Number, default: 15000 },
  startedAt: Date,
  logs: [LogSchema] // سجلات معالجة مع تفاصيل التعليق والروابط
});

module.exports = mongoose.model('JobState', JobStateSchema);
