// src/server.js
require('dotenv').config();
const express = require('express');
const dbService = require('./services/db.service');
const webhookRoutes = require('./routes/webhook.routes');
const atomicWorker = require('./worker');

const app = express();
const PORT = process.env.PORT || 10000;

// Middleware
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/webhook', webhookRoutes);

// Root Health Check Route
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Taaliqat Bot Server is running smoothly!',
    timestamp: new Date()
  });
});

/**
 * نقطة الانطلاق الرئيسية للسيرفر وربط الخدمات
 */
async function main() {
  try {
    // 1. الاتصال بقاعدة البيانات MongoDB
    await dbService.connect();

    // 2. تشغيل المجدول الذري (Atomic Worker Loop)
    if (atomicWorker && typeof atomicWorker.start === 'function') {
      atomicWorker.start();
      console.log('🤖 Atomic Worker initialized and running.');
    } else if (typeof atomicWorker === 'function') {
      atomicWorker();
      console.log('🤖 Worker function initialized.');
    } else {
      console.warn('⚠️ Worker component exported without standard start method.');
    }

    // 3. بدء استقبال الطلبات عبر Express
    app.listen(PORT, () => {
      console.log(`🚀 Express Server running on port ${PORT}`);
    });

  } catch (error) {
    console.error(`❌ Server Initialization Failed: ${error.message}`);
    process.exit(1);
  }
}

main();
