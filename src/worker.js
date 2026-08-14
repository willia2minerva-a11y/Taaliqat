// src/worker.js
const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');
const facebookService = require('./services/facebook.service');
const geminiService = require('./services/gemini.service');
const MessengerService = require('./services/messenger.service');
const { ADMIN_FB_ID } = require('./config');

async function startWorkerLoop() {
  console.log('⚙️ Background Worker Loop Started.');

  const LOOP_INTERVAL_MS = 15000;

  setInterval(async () => {
    try {
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
          await MessengerService.sendMessage(ADMIN_FB_ID, '🚨 توقفت المهمة! لا توجد حسابات كوكيز نشطة حالياً.');
        }
        return;
      }

      try {
        // 1. جلب منشور جديد معزول
        const postData = await facebookService.fetchNextPost(
          activeCookie.data,
          job.groupUrl || 'https://mbasic.facebook.com',
          job.visitedPosts || []
        );

        // 2. توليد تعليق الذكاء الاصطناعي (أو الخطة B)
        const aiResult = await geminiService.generateComment(postData.postText);

        // 3. التعليق الأول (AI / الخطة B)
        await facebookService.submitComment(activeCookie.data, postData.postUrl, aiResult.comment);

        // 4. التعليق الثاني (الثابت / الهشتاج)
        await facebookService.submitComment(activeCookie.data, postData.postUrl, job.fixedComment);

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

        console.log(`✅ تم التعليق بنجاح على [${postData.cleanUrl}] بواسطة [${activeCookie.name}]`);

        if (!aiResult.isAi && ADMIN_FB_ID) {
          const warningMsg = `⚠️ **تنبيه الخطة B:**\n\n` +
            `• المنشور: ${postData.cleanUrl}\n` +
            `• السبب: ${aiResult.reason || 'تعذر التوليد'}\n` +
            `• التعليق المكتوب: ${aiResult.comment}`;
          await MessengerService.sendMessage(ADMIN_FB_ID, warningMsg);
        }

      } catch (err) {
        console.error(`⚠️ خطأ في حساب [${activeCookie.name}]: ${err.message}`);

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
              `• السبب: ${err.message}\n` +
              `💡 سيتم التبديل تلقائياً للحساب النشط التالي.`;
            
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
