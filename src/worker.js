// src/worker.js
const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');
const facebookService = require('./services/facebook.service');
const MessengerService = require('./services/messenger.service');
const { ADMIN_FB_ID } = require('./config');

async function startWorkerLoop() {
  console.log('⚙️ Background Worker Loop Started.');

  setInterval(async () => {
    const job = await JobState.findOne({ isRunning: true });
    if (!job) return;

    if (job.processedPosts >= job.targetPosts) {
      job.isRunning = false;
      await job.save();
      if (ADMIN_FB_ID) {
        await MessengerService.sendMessage(ADMIN_FB_ID, '🎉 اكتملت المهمة بنجاح واستوفيت جميع المنشورات المطلوبة!');
      }
      return;
    }

    const activeCookie = await Cookie.findOne({ status: 'ACTIVE' });
    if (!activeCookie) {
      job.isRunning = false;
      await job.save();
      if (ADMIN_FB_ID) {
        await MessengerService.sendMessage(ADMIN_FB_ID, '🚨 توقفت المهمة! لا توجد حسابات كوكيز نشطة حالياً في النظام.');
      }
      return;
    }

    const targetUrl = 'https://mbasic.facebook.com'; // أو رابط المنشور المستهدف

    try {
      await facebookService.postComment(activeCookie.data, targetUrl, job.fixedComment);

      // 1. تحديث العدادات
      job.processedPosts += 1;
      
      // 2. تسجيل السجل مع رابط المنشور والتعليق
      job.logs.push({
        cookieName: activeCookie.name,
        postUrl: targetUrl,
        commentText: job.fixedComment,
        status: 'SUCCESS'
      });
      // الاحتفاظ بآخر 50 سجل فقط للحد من استهلاك الذاكرة
      if (job.logs.length > 50) job.logs.shift();

      await job.save();

      activeCookie.successCount += 1;
      await activeCookie.save();

      console.log(`📈 تم النشر بنجاح بواسطة [${activeCookie.name}]!`);

    } catch (err) {
      console.error(`⚠️ خطأ في الحساب [${activeCookie.name}]: ${err.message}`);
      
      // فحوصات الأخطاء الحرجة للحساب (Login / Checkpoint / Block)
      const isCriticalError = err.message.includes('login') || 
                              err.message.includes('checkpoint') || 
                              err.message.includes('blocked');

      if (isCriticalError) {
        activeCookie.status = 'EXPIRED';
        activeCookie.failureReason = err.message;
        await activeCookie.save();

        // 🔔 إرسال تنبيه فوري للمستلِم (المشرف) عبر الميسنجر
        if (ADMIN_FB_ID) {
          const alertMsg = `⚠️ **تنبيه عطل حساب!**\n\n` +
            `• الحساب: [${activeCookie.name}]\n` +
            `• الحالة: توقف / منتهي 🔴\n` +
            `• السبب: ${err.message}\n\n` +
            `💡 يمكنك حذفه عبر الأمر: /حذف ${activeCookie.name}`;
          
          await MessengerService.sendMessage(ADMIN_FB_ID, alertMsg);
        }
      }

      // تسجيل الفشل في السجلات
      job.logs.push({
        cookieName: activeCookie.name,
        postUrl: targetUrl,
        commentText: job.fixedComment,
        status: 'FAILED',
        errorDetails: err.message
      });
      await job.save();
    }
  }, 15000);
}

module.exports = { startWorkerLoop };
