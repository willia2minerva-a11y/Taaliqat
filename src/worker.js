const JobState = require('./models/JobState');
const Post = require('./models/Post');
const CookieManagerService = require('./services/cookieManager.service');
const FacebookService = require('./services/facebook.service');
const AiService = require('./services/ai.service');
const MessengerService = require('./services/messenger.service');
const { ADMIN_FB_ID } = require('./config');

async function logSystemEvent(message, level = 'INFO') {
  console.log(`[${level}] ${message}`);
  await JobState.findOneAndUpdate({}, {
    $push: { logs: { $each: [{ message, level }], $slice: -20 } }
  });
}

async function startWorkerLoop() {
  console.log('⚙️ Background Worker Loop Started.');

  while (true) {
    try {
      const job = await JobState.findOne();

      // إذا لم تكن هناك مهمة قيد التشغيل، انتظر 10 ثوانٍ
      if (!job || !job.isRunning) {
        await new Promise(res => setTimeout(res, 10000));
        continue;
      }

      // إذا اكتمل الهدف المطلوب
      if (job.processedPosts >= job.targetPosts) {
        await JobState.findOneAndUpdate({}, { isRunning: false });
        await logSystemEvent('🏁 أكتملت المهمة بنجاح ووصلت للعدد المطلوب!', 'INFO');
        if (ADMIN_FB_ID) {
          await MessengerService.sendMessage(ADMIN_FB_ID, '🎉 اكتملت جميع المنشورات المطلوبة بنجاح!');
        }
        continue;
      }

      // 1. جلب الكوكيز التالي المتاح
      let activeCookie;
      try {
        activeCookie = await CookieManagerService.getNextAvailableCookie();
      } catch (err) {
        await logSystemEvent(`🛑 توقفت المهمة: ${err.message}`, 'ERROR');
        if (ADMIN_FB_ID) {
          await MessengerService.sendMessage(ADMIN_FB_ID, `🚨 تنبيه فادح: ${err.message}\nتم إيقاف المهمة.`);
        }
        await JobState.findOneAndUpdate({}, { isRunning: false });
        continue;
      }

      // 2. تشغيل متصفح Puppeteer
      const fbService = new FacebookService();
      try {
        await fbService.init(activeCookie.data);
        await fbService.goToGroup();

        const extractedPosts = await fbService.extractFeedPosts();

        for (const post of extractedPosts) {
          // إعادة جلب حالة المهمة للتأكد من عدم إيقافها يدويًا بأمر /stop
          const freshJob = await JobState.findOne();
          if (!freshJob || !freshJob.isRunning) break;

          const generatedId = `post_${Buffer.from(post.textSnippet.substring(0, 30)).toString('base64')}`;

          const exists = await Post.findOne({ postId: generatedId });
          if (exists) continue;

          // توليد تعليق الـ AI
          const aiComment = await AiService.generateComment(post.textSnippet);

          // تنفيذ التعليقات
          const success = await fbService.postComments(post.index, aiComment, job.fixedComment);

          if (success) {
            await Post.create({ postId: generatedId, contentSnippet: post.textSnippet.substring(0, 50) });
            await JobState.findOneAndUpdate({}, { $inc: { processedPosts: 1 } });
            
            // وضع الحساب في استراحة خفيفة لتدوير الاستخدام
            await CookieManagerService.setCooldown(activeCookie._id, 5);

            await logSystemEvent(`✅ تم التعليق بنجاح باستخدام [${activeCookie.name}]`, 'INFO');
            break; // الخروج للانتقال للدورة التالية والتأخير
          }
        }
      } catch (fbError) {
        await logSystemEvent(`⚠️ خطأ في الحساب [${activeCookie.name}]: ${fbError.message}`, 'WARN');

        if (fbError.message.includes('SESSION_EXPIRED')) {
          await CookieManagerService.markAsExpired(activeCookie._id, fbError.message);
          if (ADMIN_FB_ID) {
            await MessengerService.sendMessage(ADMIN_FB_ID, `⚠️ تعطل الحساب [${activeCookie.name}] بسبب انتهاء الجلسة. جاري الانتقال للحساب التالي...`);
          }
        }
      } finally {
        await fbService.close();
      }

      // تطبيق التأخير الزمني المحسوب بين المنشورات
      await new Promise(res => setTimeout(res, job.delayBetweenPostsMs || 10000));

    } catch (globalError) {
      console.error('❌ Unexpected Error in Worker Loop:', globalError);
      await new Promise(res => setTimeout(res, 10000));
    }
  }
}

module.exports = { startWorkerLoop };
