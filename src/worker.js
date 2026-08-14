// src/worker.js
const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');
const facebookService = require('./services/facebook.service');

async function startWorkerLoop() {
  console.log('⚙️ Background Worker Loop Started.');

  setInterval(async () => {
    const job = await JobState.findOne({ isRunning: true });
    if (!job) return;

    if (job.processedPosts >= job.targetPosts) {
      job.isRunning = false;
      await job.save();
      console.log('✅ المهمة اكتملت بنجاح!');
      return;
    }

    const activeCookie = await Cookie.findOne({ status: 'ACTIVE' });
    if (!activeCookie) {
      console.warn('⚠️ لا توجد حسابات كوكيز نشطة حالياً.');
      job.isRunning = false;
      await job.save();
      return;
    }

    try {
      const targetUrl = 'https://mbasic.facebook.com'; // يفضل استخدام النسخة الخفيفة لسرعة فائقة
      
      await facebookService.postComment(activeCookie.data, targetUrl, job.fixedComment);

      // تحديث العداد
      job.processedPosts += 1;
      await job.save();

      activeCookie.successCount += 1;
      await activeCookie.save();

      console.log(`📈 تم النشر بنجاح! الإنجاز: ${job.processedPosts}/${job.targetPosts}`);

    } catch (err) {
      console.error(`⚠️ خطأ في الحساب [${activeCookie.name}]: ${err.message}`);
      
      // عدم تغيير الحالة إلى EXPIRED إلا إذا كان الخطأ متعلقاً بالسيشن/التسجيل صراحة
      if (err.message.includes('login') || err.message.includes('checkpoint')) {
        activeCookie.status = 'EXPIRED';
        activeCookie.failureReason = err.message;
        await activeCookie.save();
      }
    }
  }, 15000);
}

module.exports = { startWorkerLoop };
