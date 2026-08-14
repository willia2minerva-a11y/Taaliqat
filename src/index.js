require('dotenv').config();

const config = {
  port: process.env.PORT || 10000,

  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI,

  geminiApiKey: process.env.GEMINI_API_KEY,

  verifyToken: process.env.VERIFY_TOKEN,

  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,

  fbGroupUrl: process.env.FB_GROUP_URL,

  adminFbId: process.env.ADMIN_FB_ID
};

console.log('🔍 Config loaded');
console.log('VERIFY_TOKEN:', config.verifyToken ? '✅ Set' : '❌ Missing');

module.exports = config;
