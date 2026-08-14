// src/models/JobState.js
const mongoose = require('mongoose');

const JobStateSchema = new mongoose.Schema({
  isRunning: { type: Boolean, default: false },
  targetPosts: { type: Number, default: 100 },
  processedPosts: { type: Number, default: 0 },
  delaySeconds: { type: Number, default: 1 },
  fixedComment: { type: String, default: '✯⁠[#عشيرة_البيجو]✯⁠' },
  groupUrl: { type: String, default: 'https://mbasic.facebook.com' },
  // مصفوفة حفظ المنشورات التي تم التعليق عليها لتجنب التكرار
  visitedPosts: [{ type: String }],
  logs: [{
    cookieName: String,
    postUrl: String,
    commentText: String,
    fixedCommentText: String,
    status: String,
    isAi: Boolean,
    errorDetails: String,
    timestamp: { type: Date, default: Date.now }
  }]
}, { timestamps: true });

module.exports = mongoose.model('JobState', JobStateSchema);
