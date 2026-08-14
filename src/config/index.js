// src/config/index.js
require('dotenv').config();

console.log('🔍 Environment Variables Check:');
console.log('VERIFY_TOKEN:', process.env.VERIFY_TOKEN ? '✅ Set' : '❌ Missing');
console.log('MONGO_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Missing');
console.log('GEMINI_API_KEY:', process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing');
console.log('PAGE_ACCESS_TOKEN:', process.env.PAGE_ACCESS_TOKEN ? '✅ Set' : '❌ Missing');

module.exports = {
  port: process.env.PORT || 10000,
  nodeEnv: process.env.NODE_ENV || 'development',
  
  // ✅ استخدام MONGO_URI مباشرة من process.env
  mongoUri: process.env.MONGO_URI || process.env.MONGODB_URI,
  
  geminiApiKey: process.env.GEMINI_API_KEY,
  verifyToken: process.env.VERIFY_TOKEN,
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,
  fbGroupUrl: process.env.FB_GROUP_URL,
  adminFbId: process.env.ADMIN_FB_ID,
  puppeteerSkipDownload: process.env.PUPPETEER_SKIP_CHROMIUM_DOWNLOAD === 'true',
  puppeteerExecutablePath: process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable'
};
