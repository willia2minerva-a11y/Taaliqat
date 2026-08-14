// src/models/Cookie.js
const mongoose = require('mongoose');

const cookieSchema = new mongoose.Schema({
  accountName: {  // ✅ تأكد من أن الاسم هنا accountName
    type: String,
    required: true,
    unique: true
  },
  cookies: {
    type: Array,
    required: true
  },
  status: {
    type: String,
    enum: ['ACTIVE', 'BLOCKED', 'EXPIRED'],
    default: 'ACTIVE'
  },
  cooldownUntil: {
    type: Date,
    default: null
  },
  lastUsedAt: {
    type: Date,
    default: Date.now
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Cookie', cookieSchema);
