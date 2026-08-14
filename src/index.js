// src/index.js
const express = require('express');
const mongoose = require('mongoose');
const { PORT, MONGO_URI } = require('./config');
const webhookRoutes = require('./routes/webhook.routes'); // أو المسار المعرف لديك
const JobService = require('./services/job.service');

const app = express();
app.use(express.json());

// مسارات التطبيق
app.use('/', webhookRoutes);

// الاتصال بقاعدة البيانات وبدء تشغيل الـ Worker
mongoose.connect(MONGO_URI)
  .then(() => {
    console.log('✅ Connected to MongoDB Atlas');
    
    // بدء تشغيل الخادم
    app.listen(PORT || 3000, () => {
      console.log(`🚀 Server running on port ${PORT || 3000}`);
      
      // 🔔 تشغيل محرك المهام الدورية (كل 10 ثواني يفحص ويُنفذ)
      JobService.initWorker(10000);
    });
  })
  .catch((err) => {
    console.error('❌ Database Connection Error:', err);
  });
