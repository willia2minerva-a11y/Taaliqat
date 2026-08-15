require('dotenv').config();

const express = require('express');
const dbService = require('./services/db.service');
const webhookRoutes = require('./routes/webhook.routes');
const errorHandler = require('./middlewares/errorHandler');
const atomicWorker = require('./worker');

const app = express();
const PORT = process.env.PORT || 10000;

app.use(express.json({ limit: '2mb' }));
app.use(express.urlencoded({ extended: true }));

app.use('/webhook', webhookRoutes);

app.get('/', (req, res) => {
  res.status(200).json({
    status: 'ok',
    service: 'Taaliqat Bot',
    time: new Date().toISOString()
  });
});

app.get('/health', (req, res) => {
  res.status(200).json({
    status: 'healthy',
    database: dbService.isConnected
      ? 'connected'
      : 'unknown',
    worker: atomicWorker?.isProcessing
      ? 'processing'
      : 'idle',
    time: new Date().toISOString()
  });
});

app.use(errorHandler);

let server;

async function main() {
  try {
    console.log('🔍 Environment Variables Check:');
    console.log(`VERIFY_TOKEN: ${process.env.VERIFY_TOKEN ? '✅ Set' : '❌ Missing'}`);
    console.log(`MONGO_URI: ${process.env.MONGO_URI ? '✅ Set' : '❌ Missing'}`);
    console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅ Set' : '❌ Missing'}`);
    console.log(`PAGE_ACCESS_TOKEN: ${process.env.PAGE_ACCESS_TOKEN ? '✅ Set' : '❌ Missing'}`);

    await dbService.connect();
    console.log('✅ Database connected successfully');

    server = app.listen(PORT, () => {
      console.log(`🚀 Express Server running on port ${PORT}`);
      console.log(`📍 Environment: ${process.env.NODE_ENV || 'production'}`);
      console.log(`🌐 Webhook: /webhook`);
    });

    if (atomicWorker?.start) {
      atomicWorker.start();
      console.log('🤖 Atomic Worker initialized');
    }

  } catch (error) {
    console.error('❌ SERVER START ERROR:', error.message);
    console.error(error.stack);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`🛑 ${signal} received, shutting down...`);

  try {
    if (server) {
      await new Promise(resolve =>
        server.close(resolve)
      );
    }

    await dbService.disconnect();

    console.log('✅ Shutdown complete');
  } catch (error) {
    console.error('❌ Shutdown error:', error.message);
  }

  process.exit(0);
}

process.on('SIGTERM', () => shutdown('SIGTERM'));
process.on('SIGINT', () => shutdown('SIGINT'));

process.on('uncaughtException', error => {
  console.error('🔥 UNCAUGHT EXCEPTION:', error);
  console.error(error.stack);
});

process.on('unhandledRejection', error => {
  console.error('🔥 UNHANDLED REJECTION:', error);
});

main();
