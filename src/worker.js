// src/worker.js

const JobState = require('./models/JobState');
const Cookie = require('./models/Cookie');

const facebookService =
  require('./services/facebook.service');

const geminiService =
  require('./services/gemini.service');

class AtomicWorker {
  constructor() {
    this.isProcessing = false;

    // كل 45 ثانية
    this.interval = 45000;
  }

  // =========================================================
  // Start
  // =========================================================

  start() {
    console.log(
      '🚀 Atomic Worker Started...'
    );

    // تشغيل أول دورة مباشرة
    this.processNextTask();

    // ثم كل 45 ثانية
    setInterval(
      () => this.processNextTask(),
      this.interval
    );
  }

  // =========================================================
  // Create unique processing key
  // =========================================================

  _makeProcessingKey(
    postUrl,
    hashtag
  ) {
    const cleanPost =
      String(postUrl || '')
        .trim();

    const cleanHashtag =
      String(hashtag || '')
        .trim();

    return `${cleanPost}|||${cleanHashtag}`;
  }

  // =========================================================
  // Check if post already processed
  // with THIS hashtag
  // =========================================================

  _wasProcessed(
    job,
    postUrl,
    hashtag
  ) {
    if (
      !Array.isArray(
        job.visitedPosts
      )
    ) {
      return false;
    }

    const key =
      this._makeProcessingKey(
        postUrl,
        hashtag
      );

    return job.visitedPosts.includes(
      key
    );
  }

  // =========================================================
  // Save processed post + hashtag
  // =========================================================

  async _markAsProcessed(
    job,
    postUrl,
    hashtag
  ) {
    if (
      !Array.isArray(
        job.visitedPosts
      )
    ) {
      job.visitedPosts = [];
    }

    const key =
      this._makeProcessingKey(
        postUrl,
        hashtag
      );

    if (
      !job.visitedPosts.includes(key)
    ) {
      job.visitedPosts.push(
        key
      );
    }

    // منع تضخم الوثيقة بشكل مبالغ
    // نحتفظ بآخر 5000 معالجة
    if (
      job.visitedPosts.length >
      5000
    ) {
      job.visitedPosts =
        job.visitedPosts.slice(
          -5000
        );
    }

    await job.save();
  }

  // =========================================================
  // Get candidate posts
  // =========================================================

  async _getAvailablePosts(
    job,
    cookieDoc
  ) {
    const allPosts =
      await facebookService
        .discoverPendingPosts(
          cookieDoc.cookies,
          job.groupUrl
        );

    if (
      !Array.isArray(allPosts) ||
      allPosts.length === 0
    ) {
      return [];
    }

    const hashtag =
      job.customHashtag || '';

    // -------------------------------------------------------
    // Only exclude:
    //
    // same post + same hashtag
    //
    // A different hashtag can process
    // the same post again.
    // -------------------------------------------------------

    const available =
      allPosts.filter(
        postUrl =>
          !this._wasProcessed(
            job,
            postUrl,
            hashtag
          )
      );

    console.log(
      `📊 Found ${allPosts.length} posts`
    );

    console.log(
      `♻️ Available for hashtag "${hashtag}": ${available.length}`
    );

    return available;
  }

  // =========================================================
  // Main Task
  // =========================================================

  async processNextTask() {
    if (this.isProcessing) {
      console.log(
        '⏳ Previous task still processing...'
      );

      return;
    }

    try {
      this.isProcessing = true;

      // -----------------------------------------------------
      // 1. Get job
      // -----------------------------------------------------

      const job =
        await JobState.findOne({
          jobId: 'main_job'
        });

      if (
        !job ||
        !job.isRunning
      ) {
        return;
      }

      // -----------------------------------------------------
      // 2. Check target
      // -----------------------------------------------------

      if (
        job.completedCount >=
        job.totalTarget
      ) {
        job.isRunning = false;

        job.pendingPosts = [];

        await job.save();

        console.log(
          '✅ المهمة اكتملت بنجاح!'
        );

        return;
      }

      // -----------------------------------------------------
      // 3. Active cookie
      // -----------------------------------------------------

      const activeCookieDoc =
        await Cookie.findOne({
          status: 'ACTIVE'
        });

      if (!activeCookieDoc) {
        console.error(
          '❌ لا توجد حسابات كوكيز نشطة!'
        );

        return;
      }

      // -----------------------------------------------------
      // 4. Discover posts
      // -----------------------------------------------------

      let targetPostUrl = null;

      // أولاً حاول استخدام pendingPosts
      // ولكن تحقق أنها مناسبة للهاشتاغ الحالي
      if (
        Array.isArray(
          job.pendingPosts
        ) &&
        job.pendingPosts.length > 0
      ) {
        while (
          job.pendingPosts.length > 0
        ) {
          const candidate =
            job.pendingPosts.shift();

          if (
            !this._wasProcessed(
              job,
              candidate,
              job.customHashtag
            )
          ) {
            targetPostUrl =
              candidate;

            break;
          }
        }

        await job.save();
      }

      // -----------------------------------------------------
      // إذا لم نجد منشوراً في queue
      // نبحث عن كل المنشورات من جديد
      // -----------------------------------------------------

      if (!targetPostUrl) {
        console.log(
          '🔎 Searching group posts...'
        );

        const availablePosts =
          await this._getAvailablePosts(
            job,
            activeCookieDoc
          );

        if (
          availablePosts.length === 0
        ) {
          console.log(
            '⌛ لا توجد منشورات متاحة لهذا الهاشتاغ حالياً.'
          );

          return;
        }

        // نضع البقية في queue
        targetPostUrl =
          availablePosts.shift();

        job.pendingPosts =
          availablePosts;

        await job.save();
      }

      if (!targetPostUrl) {
        console.log(
          '⌛ لم يتم اختيار منشور.'
        );

        return;
      }

      console.log(
        `🎯 Selected post: ${targetPostUrl}`
      );

      console.log(
        `🏷️ Current hashtag: ${job.customHashtag}`
      );

      // -----------------------------------------------------
      // 5. Read post
      // -----------------------------------------------------

      const postText =
        await facebookService
          .fetchPostText(
            activeCookieDoc.cookies,
            targetPostUrl
          );

      if (!postText) {
        throw new Error(
          'لم يتم العثور على نص المنشور'
        );
      }

      console.log(
        `📖 Post text length: ${postText.length}`
      );

      // -----------------------------------------------------
      // 6. Generate AI comment
      // -----------------------------------------------------

      const aiComment =
        await geminiService
          .generateSmartComment(
            postText,
            process.env.GEMINI_API_KEY
          );

      if (
        !aiComment ||
        !aiComment.trim()
      ) {
        throw new Error(
          'Gemini لم يُرجع تعليقاً صالحاً'
        );
      }

      // -----------------------------------------------------
      // 7. Submit comments
      // -----------------------------------------------------

      await facebookService
        .submitDualComments(
          activeCookieDoc.cookies,
          targetPostUrl,
          aiComment,
          job.customHashtag
        );

      // -----------------------------------------------------
      // 8. Mark:
      //
      // POST + HASHTAG
      //
      // -----------------------------------------------------

      await this._markAsProcessed(
        job,
        targetPostUrl,
        job.customHashtag
      );

      // -----------------------------------------------------
      // 9. Update completed count
      // -----------------------------------------------------

      job.completedCount =
        Number(
          job.completedCount || 0
        ) + 1;

      await job.save();

      console.log(
        `🎉 [${job.completedCount}/${job.totalTarget}] تم التعليق بنجاح`
      );

      console.log(
        `📌 Post: ${targetPostUrl}`
      );

      console.log(
        `🏷️ Hashtag: ${job.customHashtag}`
      );

    } catch (error) {
      console.error(
        `⚠️ خطأ أثناء تنفيذ المهمة الذرية: ${error.message}`
      );

    } finally {
      this.isProcessing = false;

      if (global.gc) {
        try {
          global.gc();
        } catch {}
      }
    }
  }
}

module.exports =
  new AtomicWorker();
