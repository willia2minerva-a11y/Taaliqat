// src/index.js
// ✅ هذا الملف يصدر جميع الخدمات والنماذج للاستخدام السهل

// ===== Config =====
const config = require('./config');

// ===== Services =====
const dbService = require('./services/db.service');
const facebookService = require('./services/facebook.service');
const geminiService = require('./services/gemini.service');
const jobService = require('./services/job.service');
const messengerService = require('./services/messenger.service');
const cookieManagerService = require('./services/cookieManager.service');

// ===== Models =====
const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');
const Post = require('./models/Post');

// ===== Controllers =====
const webhookController = require('./controllers/webhook.controller');

// ===== Routes =====
const webhookRoutes = require('./routes/webhook.routes');

// ===== Middlewares =====
const errorHandler = require('./middlewares/errorHandler');

// ===== Worker =====
const atomicWorker = require('./worker');

// ===== Server =====
const server = require('./server');

// ✅ تصدير كل شيء للاستخدام في ملفات أخرى
module.exports = {
  config,
  dbService,
  facebookService,
  geminiService,
  jobService,
  messengerService,
  cookieManagerService,
  JobState,
  Cookie,
  Post,
  webhookController,
  webhookRoutes,
  errorHandler,
  atomicWorker,
  server
};

// ✅ طباعة رسالة تأكيد
console.log('📦 Taaliqat Bot modules loaded successfully!');
console.log(`🔑 VERIFY_TOKEN: ${config.verifyToken ? '✅ Configured' : '❌ NOT SET!'}`);
console.log(`🗄️  Database: ${config.mongoUri ? '✅ Configured' : '❌ NOT SET!'}`);
console.log(`🤖 Gemini AI: ${config.geminiApiKey ? '✅ Configured' : '❌ NOT SET!'}`);
console.log(`📱 Page Access Token: ${config.pageAccessToken ? '✅ Configured' : '❌ NOT SET!'}`);
