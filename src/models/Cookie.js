// src/models/Cookie.js

const mongoose = require('mongoose');

const cookieSchema = new mongoose.Schema(
  {
    // اسم حساب Facebook
    accountName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    // Facebook cookies
    cookies: {
      type: Array,
      default: []
    },

    // حالة الحساب
    status: {
      type: String,
      enum: [
        'ACTIVE',
        'BLOCKED',
        'EXPIRED'
      ],
      default: 'ACTIVE'
    },

    // سبب آخر فشل
    lastError: {
      type: String,
      default: null
    },

    // وقت آخر فحص
    lastCheckedAt: {
      type: Date,
      default: null
    },

    // وقت آخر استخدام
    lastUsedAt: {
      type: Date,
      default: null
    },

    // وقت انتهاء الحظر المؤقت
    cooldownUntil: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.model(
    'Cookie',
    cookieSchema
  );
