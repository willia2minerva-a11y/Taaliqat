require('dotenv').config();

module.exports = {
  PORT: process.env.PORT || 10000,
  MONGO_URI: process.env.MONGO_URI,
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  FB_GROUP_URL: process.env.FB_GROUP_URL,
  FB_PAGE_ACCESS_TOKEN: process.env.FB_PAGE_ACCESS_TOKEN,
  FB_VERIFY_TOKEN: process.env.FB_VERIFY_TOKEN,
  ADMIN_FB_ID: process.env.ADMIN_FB_ID,
};
