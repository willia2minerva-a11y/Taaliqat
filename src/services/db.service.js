const mongoose = require('mongoose');
const { MONGO_URI } = require('../config');

class DbService {
  static async connect() {
    try {
      await mongoose.connect(MONGO_URI);
      console.log('✅ Connected to MongoDB.');
    } catch (error) {
      console.error('❌ MongoDB Connection Error:', error.message);
      process.exit(1);
    }
  }
  static async disconnect() {
    await mongoose.disconnect();
  }
}
module.exports = DbService;
