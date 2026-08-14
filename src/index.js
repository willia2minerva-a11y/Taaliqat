// src/config/index.js
require('dotenv').config();

// ✅ طباعة المتغيرات للتصحيح
console.log('🔍 Environment Variables Check:');
console.log('VERIFY_TOKEN:', process.env.VERIFY_TOKEN ? '✅ Set' : '❌ Missing');
console.log('MONGO_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Missing');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing');
console.log('PAGE_ACCESS_TOKEN:', process.env.PAGE_ACCESS_TOKEN ? '✅ Set' : '❌ Missing');

module.exports = {
  // Server
  port: process.env.PORT || 10000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database
  mongoUri: process.env.MONGO_URI,
  
  // AI
  geminiApiKey: process.env.GEMINI_API_KEY,
  
  // Facebook Webhook
  verifyToken: process.env.VERIFY_TOKEN,
  
  // Facebook Page
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,
  
  // Facebook Group
  fbGroupUrl: process.env.FB_GROUP_URL,
  
  // Admin
  adminFbId: process.env.ADMIN_FB_ID
};
