// src/worker.js
const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');
const FacebookService = require('./services/facebook.service');

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

    // إنشاء نسخة جديدة من الخدمة لكل مهمة (Instance Pattern)
    const fbService = new FacebookService();

    try {
      // 1. التهيئة
      await fbService.init(activeCookie.data);

      // 2. التنفيذ (يمكنك إسناد رابط منشور حقيقي هنا)
      const targetUrl = 'https://www.facebook.com'; 
      await fbService.postComment(targetUrl, job.fixedComment);

      // 3. تحديث البيانات
      job.processedPosts += 1;
      await job.save();

      activeCookie.successCount += 1;
      await activeCookie.save();

      console.log(`📈 تم النشر بنجاح! الإنجاز الحالي: ${job.processedPosts}/${job.targetPosts}`);

    } catch (err) {
      console.error(`⚠️ خطأ في الحساب [${activeCookie.name}]: ${err.message}`);
      
      activeCookie.status = 'EXPIRED';
      activeCookie.failureReason = err.message;
      await activeCookie.save();
    } finally {
      // إغلاق المتصفح دائماً حتى عند حدوث استثناء
      await fbService.close();
    }
  }, 15000); // تنفذ كل 15 ثانية
}

module.exports = { startWorkerLoop };
