// src/config/index.js
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 10000,
  // ✅ تصحيح: استخدام MONGODB_URI بدلاً من MONGO_URI
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI,
  geminiApiKey: process.env.GEMINI_API_KEY,
  // ✅ تصحيح: التأكد من قراءة VERIFY_TOKEN بشكل صحيح
  verifyToken: process.env.VERIFY_TOKEN || process.env.verify_token,
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,
  fbGroupUrl: process.env.FB_GROUP_URL,
  adminFbId: process.env.ADMIN_FB_ID
};
