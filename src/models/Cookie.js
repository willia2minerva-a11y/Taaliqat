// src/models/Cookie.js

const mongoose = require('mongoose');

const cookieSchema = new mongoose.Schema(
  {
    // -------------------------------------------------------
    // Facebook account name
    // -------------------------------------------------------

    accountName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    // -------------------------------------------------------
    // Facebook cookies
    // -------------------------------------------------------

    cookies: {
      type: Array,
      default: []
    },

    // -------------------------------------------------------
    // Account status
    // -------------------------------------------------------

    status: {
      type: String,
      enum: ['ACTIVE', 'BLOCKED', 'EXPIRED'],
      default: 'ACTIVE'
    },

    // -------------------------------------------------------
    // Optional cooldown
    // -------------------------------------------------------

    cooldownUntil: {
      type: Date,
      default: null
    },

    // -------------------------------------------------------
    // Last usage
    // -------------------------------------------------------

    lastUsedAt: {
      type: Date,
      default: null
    }
  },
  {
    timestamps: true,
    minimize: false
  }
);

// ===========================================================
// Prevent saving obviously broken documents
// ===========================================================

cookieSchema.pre('save', function (next) {
  if (
    !this.accountName ||
    String(this.accountName).trim() === '' ||
    String(this.accountName).toLowerCase() === 'undefined'
  ) {
    return next(
      new Error(
        'COOKIE_MODEL_ERROR: accountName is required and cannot be undefined'
      )
    );
  }

  if (!Array.isArray(this.cookies)) {
    this.cookies = [];
  }

  next();
});

module.exports =
  mongoose.models.Cookie ||
  mongoose.model('Cookie', cookieSchema);
