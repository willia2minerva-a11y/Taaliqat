require('dotenv').config();

const express = require('express');
const dbService = require('./services/db.service');
const webhookRoutes = require('./routes/webhook.routes');
const errorHandler = require('./middlewares/errorHandler');
const worker = require('./worker');

const app = express();
const PORT = process.env.PORT || 10000;

console.log('🔍 Environment Variables Check:');
console.log(`VERIFY_TOKEN: ${process.env.VERIFY_TOKEN ? '✅' : '❌'}`);
console.log(`MONGO_URI: ${process.env.MONGO_URI ? '✅' : '❌'}`);
console.log(`GEMINI_API_KEY: ${process.env.GEMINI_API_KEY ? '✅' : '❌'}`);
console.log(`PAGE_ACCESS_TOKEN: ${process.env.PAGE_ACCESS_TOKEN ? '✅' : '❌'}`);

app.use(express.json({
  limit: '2mb'
}));

app.use(express.urlencoded({
  extended: true
}));

// Webhook
app.use('/webhook', webhookRoutes);

// Health
app.get('/', (req, res) => {
  res.status(200).json({
    ok: true,
    service: 'Taaliqat Bot',
    webhook: '/webhook',
    time: new Date().toISOString()
  });
});

// Catch errors
app.use(errorHandler);

async function main() {
  try {
    console.log('🔗 Connecting to MongoDB...');

    await dbService.connect();

    console.log('✅ Database connected successfully');

    if (
      worker &&
      typeof worker.start === 'function'
    ) {
      worker.start();
      console.log('🤖 Atomic Worker initialized');
    }

    app.listen(PORT, () => {
      console.log(
        `🚀 Express Server running on port ${PORT}`
      );
      console.log(
        `📍 Environment: ${process.env.NODE_ENV || 'development'}`
      );
      console.log(
        `🌐 Webhook: https://taaliqat.onrender.com/webhook`
      );
    });

  } catch (error) {
    console.error(
      '❌ SERVER START ERROR:',
      error.message
    );
    console.error(error.stack);
    process.exit(1);
  }
}

async function shutdown(signal) {
  console.log(`🛑 ${signal} received`);

  try {
    await dbService.disconnect();
    console.log('🔌 Disconnected from MongoDB');
  } catch (error) {
    console.error(
      '❌ Shutdown error:',
      error.message
    );
  }

  process.exit(0);
}

process.on('SIGTERM', () =>
  shutdown('SIGTERM')
);

process.on('SIGINT', () =>
  shutdown('SIGINT')
);

main();
