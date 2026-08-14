// src/worker.js
const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');
const facebookService = require('./services/facebook.service');
const geminiService = require('./services/gemini.service');

class AtomicWorker {
  constructor() {
    this.isProcessing = false;
  }

  /**
   * تشغيل حلقة الفحص المتقطع
   */
  start() {
    console.log('🚀 Atomic Worker Started...');
    // فحص كل 45 ثانية لمعالجة منشور واحد بمرونة
    setInterval(() => this.processNextTask(), 45000);
  }

  async processNextTask() {
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;

      // 1. قراءة حالة المهمة الحالية من قاعدة البيانات
      const job = await JobState.findOne({ jobId: 'main_job' });
      if (!job || !job.isRunning) {
        this.isProcessing = false;
        return;
      }

      // 2. التحقق من اكتمال المهمة
      if (job.completedCount >= job.totalTarget) {
        job.isRunning = false;
        job.pendingPosts = [];
        await job.save();
        console.log('✅ اكتملت المهمة بنجاح!');
        this.isProcessing = false;
        return;
      }

      // 3. جلب أول حساب كوكيز نشط
      const activeCookieDoc = await Cookie.findOne({ status: 'ACTIVE' });
      if (!activeCookieDoc) {
        console.error('❌ لا توجد حسابات كوكيز نشطة!');
        this.isProcessing = false;
        return;
      }

      // 4. إذا كانت قائمة الانتظار فارغة، قم باكتشاف منشورات جديدة
      if (!job.pendingPosts || job.pendingPosts.length === 0) {
        const discovered = await facebookService.discoverPendingPosts(
          activeCookieDoc.cookies,
          job.groupUrl,
          job.visitedPosts
        );

        if (discovered.length === 0) {
          console.log('⌛ لم يتم العثور على منشورات جديدة حالياً، انتظار الدورة القادمة...');
          this.isProcessing = false;
          return;
        }

        job.pendingPosts = discovered;
        await job.save();
      }

      // 5. سحب أول منشور من قائمة الانتظار
      const targetPostUrl = job.pendingPosts.shift();

      // 6. قراءة نص المنشور وتوليد التعليق
      const postText = await facebookService.fetchPostText(activeCookieDoc.cookies, targetPostUrl);
      const aiComment = await geminiService.generateSmartComment(postText, process.env.GEMINI_API_KEY);

      // 7. نشر التعليق المزدوج (AI + Hashtag)
      await facebookService.submitDualComments(
        activeCookieDoc.cookies,
        targetPostUrl,
        aiComment,
        job.customHashtag
      );

      // 8. تحديث قاعدة البيانات
      job.visitedPosts.push(targetPostUrl);
      job.completedCount += 1;
      await job.save();

      console.log(`🎉 [${job.completedCount}/${job.totalTarget}] تم التعليق بنجاح على: ${targetPostUrl}`);

    } catch (error) {
      console.error(`⚠️ خطأ أثناء تنفيذ المهمة الذرية: ${error.message}`);
    } finally {
      this.isProcessing = false;

      // تحرير الذاكرة العشوائية صراحةً بعد كل عملية ذرية
      if (global.gc) {
        global.gc();
      }
    }
  }
}

module.exports = new AtomicWorker();
