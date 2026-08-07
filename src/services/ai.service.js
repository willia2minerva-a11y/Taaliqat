const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');

class DbService {
  static async connect() {
    try {
      if (!MONGO_URI) {
        throw new Error("MONGO_URI غير معرف في متغيرات البيئة.");
      }
      await mongoose.connect(MONGO_URI);
      console.log('✅ Connected to MongoDB Atlas.');
    } catch (error) {
      console.error('❌ MongoDB Connection Failure:', error.message);
      process.exit(1);
    }
  }
}

module.exports = DbService;
