const mongoose = require('mongoose');

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
  // ✅ حقل لتخزين آخر خطأ (مرة واحدة فقط)
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
  // ✅ الصفحات التابعة للحساب
  pages: {
    type: [pageSchema],
    default: []
  },
  // عدد التعليقات عبر الحساب الشخصي
  personalCommentsCount: {
    type: Number,
    default: 0
  },
  // نسبة التعليقات عبر الصفحات (0-100)
  pagesRatio: {
    type: Number,
    default: 60
  },
  // ✅ حقل لتخزين آخر خطأ للحساب الشخصي
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
