// src/worker.js
const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');
const facebookService = require('./services/facebook.service');
const geminiService = require('./services/gemini.service');
const MessengerService = require('./services/messenger.service');
const { ADMIN_FB_ID } = require('./config');

/**
 * دالة حلقة العمل الخلفية (Worker Loop Engine)
 */
async function startWorkerLoop() {
  console.log('⚙️ Background Worker Loop Started.');

  // تحديد فترة التكرار الافتراضية بشكل ثابت ومباشر (15 ثانية) لتجنب أخطاء النطاق Scope Errors
  const LOOP_INTERVAL_MS = 15000;

  setInterval(async () => {
    try {
      // 1. التحقق من وجود مهمة قيد التشغيل
      const job = await JobState.findOne({ isRunning: true });
      if (!job) return;

      // 2. التحقق من استيفاء عدد المنشورات المستهدفة
      if (job.processedPosts >= job.targetPosts) {
        job.isRunning = false;
        await job.save();
        if (ADMIN_FB_ID) {
          await MessengerService.sendMessage(ADMIN_FB_ID, '🎉 اكتملت المهمة بنجاح واستوفيت جميع المنشورات المطلوبة!');
        }
        return;
      }

      // 3. جلب أول حساب نشط من قاعدة البيانات
      const activeCookie = await Cookie.findOne({ status: 'ACTIVE' });
      if (!activeCookie) {
        job.isRunning = false;
        await job.save();
        if (ADMIN_FB_ID) {
          await MessengerService.sendMessage(ADMIN_FB_ID, '🚨 توقفت المهمة! لا توجد حسابات كوكيز نشطة حالياً.');
        }
        return;
      }

      try {
        // 4. جلب منشور جديد غير معلق عليه سابقاً
        const postData = await facebookService.fetchNextPost(
          activeCookie.data,
          job.groupUrl || 'https://mbasic.facebook.com',
          job.visitedPosts || []
        );

        // 5. توليد تعليق الـ AI (أو الخطة B عند الفشل)
        const aiResult = await geminiService.generateComment(postData.postText);

        // 6. كتابة التعليق الأول (الذكاء الاصطناعي / الخطة B)
        await facebookService.submitComment(aiResult.comment);

        // 7. كتابة التعليق الثاني (التعليق الثابت / الهشتاج)
        await facebookService.submitComment(job.fixedComment);

        // 8. إغلاق الجلسة وتحديث السجلات
        await facebookService.close();

        job.processedPosts += 1;
        if (!job.visitedPosts) job.visitedPosts = [];
        job.visitedPosts.push(postData.cleanUrl);

        job.logs.push({
          cookieName: activeCookie.name,
          postUrl: postData.cleanUrl,
          commentText: aiResult.comment,
          fixedCommentText: job.fixedComment,
          status: 'SUCCESS',
          isAi: aiResult.isAi
        });

        if (job.logs.length > 50) job.logs.shift();
        await job.save();

        activeCookie.successCount += 1;
        await activeCookie.save();

        // إرسال تنبيه في حال استخدام الخطة B
        if (!aiResult.isAi && ADMIN_FB_ID) {
          const warningMsg = `⚠️ **تنبيه الخطة B:**\n\n` +
            `• المنشور: ${postData.cleanUrl}\n` +
            `• السبب: ${aiResult.reason || 'تعذر التوليد'}\n` +
            `• التعليق المكتوب: ${aiResult.comment}`;
          await MessengerService.sendMessage(ADMIN_FB_ID, warningMsg);
        }

      } catch (err) {
        console.error(`⚠️ خطأ في تنفيذ المهمة للحساب [${activeCookie.name}]: ${err.message}`);
        await facebookService.close();

        const isCriticalError = err.message.includes('login') || 
                                err.message.includes('checkpoint') || 
                                err.message.includes('blocked');

        if (isCriticalError) {
          activeCookie.status = 'EXPIRED';
          activeCookie.failureReason = err.message;
          await activeCookie.save();

          if (ADMIN_FB_ID) {
            const alertMsg = `⚠️ **تنبيه عطل حساب!**\n\n` +
              `• الحساب: [${activeCookie.name}]\n` +
              `• السبب الدقيق: ${err.message}\n` +
              `💡 سيتم الانتقال للحساب النشط التالي تلقائياً.`;
            
            await MessengerService.sendMessage(ADMIN_FB_ID, alertMsg);
          }
        }

        job.logs.push({
          cookieName: activeCookie.name,
          postUrl: 'غير معروف',
          commentText: 'فشل العملية',
          status: 'FAILED',
          errorDetails: err.message
        });
        await job.save();
      }

    } catch (globalError) {
      console.error('❌ Global Worker Exception:', globalError.message);
    }
  }, LOOP_INTERVAL_MS);
}

module.exports = { startWorkerLoop };
