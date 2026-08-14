// src/server.js
require('dotenv').config();
const express = require('express');
const dbService = require('./services/db.service');
const webhookRoutes = require('./routes/webhook.routes');
const errorHandler = require('./middlewares/errorHandler');
const atomicWorker = require('./worker');

const app = express();
const PORT = process.env.PORT || 10000;

// Middlewares
app.use(express.json());
app.use(express.urlencoded({ extended: true }));

// Routes
app.use('/webhook', webhookRoutes);

// Health check
app.get('/', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Taaliqat Bot Server is running smoothly!',
    timestamp: new Date(),
    environment: process.env.NODE_ENV || 'development'
  });
});

// Error handler (must be last)
app.use(errorHandler);

async function main() {
  try {
    // اتصال بقاعدة البيانات
    await dbService.connect();
    console.log('✅ Database connected successfully');

    // تشغيل العامل الذري
    if (atomicWorker && typeof atomicWorker.start === 'function') {
      atomicWorker.start();
      console.log('🤖 Atomic Worker initialized and running.');
    }

    // تشغيل السيرفر
    app.listen(PORT, () => {
      console.log(`🚀 Express Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'development'}`);
      console.log(`🔗 Webhook URL: https://your-app.onrender.com/webhook`);
    });

  } catch (error) {
    console.error(`❌ Server Initialization Failed: ${error.message}`);
    process.exit(1);
  }
}

// graceful shutdown
process.on('SIGTERM', async () => {
  console.log('🛑 SIGTERM received, shutting down gracefully...');
  await dbService.disconnect();
  process.exit(0);
});

main();
