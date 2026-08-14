// src/services/db.service.js
const mongoose = require('mongoose');
const config = require('../config');

class DatabaseService {
  async connect() {
    try {
      // ✅ التحقق من وجود URI
      const uri = config.mongoUri || process.env.MONGO_URI || process.env.MONGODB_URI;
      
      console.log('🔍 Database URI check:');
      console.log('config.mongoUri:', config.mongoUri ? '✅ Set' : '❌ Missing');
      console.log('process.env.MONGO_URI:', process.env.MONGO_URI ? '✅ Set' : '❌ Missing');
      console.log('Final URI being used:', uri ? '✅ Available' : '❌ Missing');

      if (!uri) {
        throw new Error('MongoDB URI is not defined. Please set MONGO_URI in environment variables.');
      }

      console.log(`🔗 Connecting to MongoDB...`);
      
      await mongoose.connect(uri, {
        serverSelectionTimeoutMS: 5000,
        socketTimeoutMS: 45000,
        family: 4 // استخدام IPv4
      });

      console.log('✅ Connected to MongoDB successfully.');
    } catch (error) {
      console.error(`❌ MongoDB Connection Error: ${error.message}`);
      process.exit(1);
    }
  }

  async disconnect() {
    await mongoose.disconnect();
    console.log('🔌 Disconnected from MongoDB.');
  }
}

module.exports = new DatabaseService();
