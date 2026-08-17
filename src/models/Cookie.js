const mongoose = require('mongoose');

// ✅ Schema لكائن الكوكي الواحد
const cookieItemSchema = new mongoose.Schema({
  name: {
    type: String,
    required: true,
    trim: true
  },
  value: {
    type: String,
    required: true
  },
  domain: {
    type: String,
    default: '.facebook.com'
  },
  path: {
    type: String,
    default: '/'
  },
  secure: {
    type: Boolean,
    default: true
  },
  httpOnly: {
    type: Boolean,
    default: false
  },
  sameSite: {
    type: String,
    enum: ['Strict', 'Lax', 'None'],
    default: 'Lax'
  },
  expires: {
    type: Number,
    default: null
  }
});

// ✅ Schema للصفحات التابعة للحساب
const pageSchema = new mongoose.Schema({
  pageId: {
    type: String,
    required: true,
    trim: true
  },
  pageName: {
    type: String,
    required: true,
    trim: true
  },
  pageAccessToken: {
    type: String,
    default: null
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
    default: null
  },
  commentsCount: {
    type: Number,
    default: 0
  },
  lastError: {
    type: String,
    default: null
  },
  lastErrorTime: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

// ✅ Schema الرئيسي للحسابات
const cookieSchema = new mongoose.Schema({
  accountName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  // ✅ تعريف صحيح لمصفوفة الكوكيز
  cookies: {
    type: [cookieItemSchema],
    default: []
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
    default: null
  },
  pages: {
    type: [pageSchema],
    default: []
  },
  personalCommentsCount: {
    type: Number,
    default: 0
  },
  pagesRatio: {
    type: Number,
    default: 60
  },
  lastError: {
    type: String,
    default: null
  },
  lastErrorTime: {
    type: Date,
    default: null
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Cookie', cookieSchema);
