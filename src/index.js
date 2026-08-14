// src/config/index.js
require('dotenv').config();

// ✅ طباعة المتغيرات للتصحيح
console.log('🔍 Environment Variables Check:');
console.log('VERIFY_TOKEN:', process.env.VERIFY_TOKEN ? '✅ Set' : '❌ Missing');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Missing');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing');

module.exports = {
  port: process.env.PORT || 10000,
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI,
  geminiApiKey: process.env.GEMINI_API_KEY,
  verifyToken: process.env.VERIFY_TOKEN, // ✅ مباشرة من البيئة
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,
  fbGroupUrl: process.env.FB_GROUP_URL,
  adminFbId: process.env.ADMIN_FB_ID
};
