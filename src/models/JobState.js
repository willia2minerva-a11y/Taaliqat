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
  status: {
    type: String,
    enum: ['RUNNING', 'STOPPED', 'COMPLETED', 'AUTH_FAILED', 'NO_ACCOUNT', 'ERROR'],
    default: 'STOPPED'
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
  pendingPosts: [{
    type: String
  }],
  visitedPosts: [{
    type: String
  }],
  apiKeyHealthy: {
    type: Boolean,
    default: true
  },
  lastApiFailure: {
    type: Date,
    default: null
  },
  errorReason: {
    type: String,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('JobState', jobStateSchema);
