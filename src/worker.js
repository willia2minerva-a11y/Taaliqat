// src/worker.js
const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');
const facebookService = require('./services/facebook.service');
const geminiService = require('./services/gemini.service');
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

    // جلب أول حساب نشط
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
      // 1. جلب منشور جديد غير معلق عليه
      const postData = await facebookService.fetchNextPost(
        activeCookie.data,
        job.groupUrl || 'https://mbasic.facebook.com',
        job.visitedPosts
      );

      // 2. توليد تعليق الـ AI (أو الخطة B)
      const aiResult = await geminiService.generateComment(postData.postText);

      // 3. كتابة التعليق الأول (AI / الخطة B)
      await facebookService.submitComment(aiResult.comment);

      // 4. كتابة التعليق الثاني (التعليق الثابت / الهشتاج)
      await facebookService.submitComment(job.fixedComment);

      // 5. إغلاق الجلسة وتحديث البيانات
      await facebookService.close();

      job.processedPosts += 1;
      job.visitedPosts.push(postData.cleanUrl);
      
      const logEntry = {
        cookieName: activeCookie.name,
        postUrl: postData.cleanUrl,
        commentText: aiResult.comment,
        fixedCommentText: job.fixedComment,
        status: 'SUCCESS',
        isAi: aiResult.isAi
      };

      job.logs.push(logEntry);
      if (job.logs.length > 50) job.logs.shift();
      await job.save();

      activeCookie.successCount += 1;
      await activeCookie.save();

      // تنبيه الإدارة في حال استخدام الخطة B
      if (!aiResult.isAi && ADMIN_FB_ID) {
        const warningMsg = `⚠️ **تنبيه الخطة B:**\n\n` +
          `• المنشور: ${postData.cleanUrl}\n` +
          `• السبب: ${aiResult.reason}\n` +
          `• التعليق المكتوب: ${aiResult.comment}`;
        await MessengerService.sendMessage(ADMIN_FB_ID, warningMsg);
      }

    } catch (err) {
      console.error(`⚠️ خطأ في الحساب [${activeCookie.name}]: ${err.message}`);
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
            `💡 سيتم الانتقال للحساب النشط التالي آلياً.`;
          
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
  }, (job?.delaySeconds || 5) * 1000);
}

module.exports = { startWorkerLoop };
