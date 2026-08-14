// src/models/JobState.js
const mongoose = require('mongoose');

const jobStateSchema = new mongoose.Schema({
  jobId: {
    type: String,
    required: true,
    unique: true,
    default: 'main_job'
  },
  isRunning: {
    type: Boolean,
    default: false
  },
  totalTarget: {
    type: Number,
    default: 0
  },
  completedCount: {
    type: Number,
    default: 0
  },
  groupUrl: {
    type: String,
    default: ''
  },
  customHashtag: {
    type: String,
    default: ''
  },
  // قائمة الانتظار الذرية للمنشورات المستخرجة
  pendingPosts: [{
    type: String
  }],
  // سجل المنشورات التي تم معالجتها لتفادي التكرار
  visitedPosts: [{
    type: String
  }],
  // تتبع حالة وصحة مفاتيح Gemini API للتحويل التلقائي للخطة B
  apiKeyHealthy: {
    type: Boolean,
    default: true
  },
  lastApiFailure: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('JobState', jobStateSchema);
