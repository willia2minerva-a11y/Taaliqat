// src/config/index.js
require('dotenv').config();

module.exports = {
  port: process.env.PORT || 10000,
  
  // ✅ دعم كل من MONGODB_URI و MONGO_URI
  mongoUri: process.env.MONGODB_URI || process.env.MONGO_URI,
  
  // ✅ دعم كل من GEMINI_API_KEY و geminiApiKey
  geminiApiKey: process.env.GEMINI_API_KEY || process.env.geminiApiKey,
  
  // ✅ دعم كل من VERIFY_TOKEN و verify_token
  verifyToken: process.env.VERIFY_TOKEN || process.env.verify_token || process.env.VERIFY_TOKEN_FB,
  
  // ✅ دعم كل من PAGE_ACCESS_TOKEN و FB_PAGE_ACCESS_TOKEN
  pageAccessToken: process.env.PAGE_ACCESS_TOKEN || process.env.FB_PAGE_ACCESS_TOKEN,
  
  // ✅ دعم FB_GROUP_URL
  fbGroupUrl: process.env.FB_GROUP_URL || process.env.fbGroupUrl,
  
  // ✅ دعم ADMIN_FB_ID
  adminFbId: process.env.ADMIN_FB_ID || process.env.adminFbId
};
