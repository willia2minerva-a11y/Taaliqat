// src/services/job.service.js
const JobState = require('../models/JobState');
const Cookie = require('../models/Cookie');
const MessengerService = require('./messenger.service');

class JobService {
  static isProcessing = false;

  /**
   * دالة بدء الـ Worker الخلفي الذي يفحص المهام كل فترة زمنية
   */
  static initWorker(intervalMs = 10000) {
    console.log('⚙️ Job Worker Initialized...');
    setInterval(async () => {
      if (JobService.isProcessing) return; // منع التداخل إذا كانت الدورة السابقة قيد التنفيذ
      
      try {
        await JobService.processActiveJob();
      } catch (error) {
        console.error('❌ Error in Job Worker Cycle:', error.message);
      }
    }, intervalMs);
  }

  /**
   * معالجة خطوة واحدة من المهمة النشطة
   */
  static async processActiveJob() {
    const job = await JobState.findOne({ isRunning: true });
    
    // إذا لم تكن هناك مهمة قيد التشغيل أو اكتملت المنشورات
    if (!job) return;

    if (job.processedPosts >= job.targetPosts) {
      job.isRunning = false;
      await job.save();
      console.log('✅ Task Completed Successfully!');
      return;
    }

    JobService.isProcessing = true;

    try {
      // 1. جلب حساب كوكيز نشط
      const activeCookie = await Cookie.findOne({ status: 'ACTIVE' });

      if (!activeCookie) {
        console.warn('⚠️ No active cookies available to perform action!');
        // إيقاف المهمة مؤقتاً لتجنب المحاولات الفاشلة
        job.isRunning = false;
        await job.save();
        JobService.isProcessing = false;
        return;
      }

      // 2. محاكاة / تنفيذ طلب التعليق (أدخل منطق الاتصال الخاص بك هنا)
      console.log(`🚀 Processing post ${job.processedPosts + 1}/${job.targetPosts} using cookie: ${activeCookie.name}`);
      
      // === منطق تنفيذ الطلب الخارجي لفيسبوك بـ Active Cookie ===
      // const success = await FacebookApi.postComment(activeCookie.data, job.fixedComment);
      const success = true; // محاكاة نجاح العملية

      if (success) {
        // 3. تحديث العداد وعدد نجاحات الكوكيز
        job.processedPosts += 1;
        await job.save();

        activeCookie.successCount += 1;
        await activeCookie.save();

        console.log(`📈 Progress updated: ${job.processedPosts}/${job.targetPosts}`);
      } else {
        // في حال فشل الكوكيز
        activeCookie.status = 'EXPIRED';
        activeCookie.failureReason = 'Failed during execution cycle';
        await activeCookie.save();
      }

    } catch (err) {
      console.error('❌ Error executing job step:', err.message);
    } finally {
      JobService.isProcessing = false;
    }
  }
}

module.exports = JobService;

