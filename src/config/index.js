// src/config/index.js
require('dotenv').config();

// ✅ طباعة المتغيرات للتصحيح (ستظهر في Logs Render)
console.log('🔍 Environment Variables Check:');
console.log('VERIFY_TOKEN:', process.env.VERIFY_TOKEN ? '✅ Set' : '❌ Missing');
console.log('MONGODB_URI:', process.env.MONGODB_URI ? '✅ Set' : '❌ Missing');
console.log('MONGO_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Missing');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing');
console.log('PAGE_ACCESS_TOKEN:', process.env.PAGE_ACCESS_TOKEN ? '✅ Set' : '❌ Missing');

module.exports = {
  // Server
  port: process.env.PORT || 10000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // Database - دعم كل من MONGODB_URI و MONGO_URI
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI,
  
  // AI
  geminiApiKey: process.env.GEMINI_API_KEY,
  
  // Facebook Webhook - دعم صيغ متعددة
  verifyToken: process.env.VERIFY_TOKEN || process.env.verify_token || process.env.VERIFY_TOKEN_FB,
  
  // Facebook Page
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,
  
  // Facebook Group
  fbGroupUrl: process.env.FB_GROUP_URL,
  
  // Admin
  adminFbId: process.env.ADMIN_FB_ID,
  
  // Puppeteer
  puppeteerSkipDownload: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === 'true',
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable'
};
