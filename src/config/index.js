require('dotenv').config();

module.exports = {
  GEMINI_API_KEY: process.env.GEMINI_API_KEY,
  MONGO_URI: process.env.MONGO_URI,
  FB_GROUP_URL: process.env.FB_GROUP_URL,
  FIXED_COMMENT: process.env.FIXED_COMMENT || "رائع جداً!",
  
  TIMING: {
    COMMENT_DELAY_MIN: 3000,
    COMMENT_DELAY_MAX: 6000,
    POST_DELAY_MIN: 10000,
    POST_DELAY_MAX: 15000,
  }
};

