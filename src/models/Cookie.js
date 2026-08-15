const mongoose = require('mongoose');

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
  }
}, {
  timestamps: true
});

const cookieSchema = new mongoose.Schema({
  accountName: {
    type: String,
    required: true,
    unique: true,
    trim: true
  },
  cookies: {
    type: mongoose.Schema.Types.Mixed,
    required: true,
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
  // ✅ إضافة حقل الصفحات
  pages: {
    type: [pageSchema],
    default: []
  },
  // عدد التعليقات التي تمت عبر الحساب الشخصي
  personalCommentsCount: {
    type: Number,
    default: 0
  },
  // نسبة التعليقات عبر الصفحات (0-100)
  pagesRatio: {
    type: Number,
    default: 60
  }
}, {
  timestamps: true
});

module.exports = mongoose.model('Cookie', cookieSchema);
