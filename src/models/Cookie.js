// src/models/Cookie.js

const mongoose = require('mongoose');

const cookieSchema = new mongoose.Schema(
  {
    accountName: {
      type: String,
      required: true,
      unique: true,
      trim: true
    },

    /*
     * يمكن أن يكون:
     *
     * 1) Array:
     * [
     *   { name: 'datr', value: '...' },
     *   { name: 'c_user', value: '...' },
     *   { name: 'xs', value: '...' },
     *   { name: 'fr', value: '...' }
     * ]
     *
     * أو:
     *
     * 2) Cookie Header String:
     * datr=...;sb=...;c_user=...;xs=...;fr=...
     */
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

    lastValidationAt: {
      type: Date,
      default: null
    },

    lastValidationStatus: {
      type: String,
      enum: [
        'VALID',
        'INVALID',
        'EMPTY',
        'MISSING_REQUIRED',
        'INVALID_FORMAT',
        'ERROR',
        null
      ],
      default: null
    },

    lastValidationReason: {
      type: String,
      default: null
    }
  },
  {
    timestamps: true
  }
);

module.exports =
  mongoose.model('Cookie', cookieSchema);
