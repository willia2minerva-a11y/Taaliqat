// src/worker.js

const JobState =
  require('./models/JobState');

const cookieManager =
  require('./services/cookieManager.service');

const facebookService =
  require('./services/facebook.service');

const geminiService =
  require('./services/gemini.service');

class AtomicWorker {
  constructor() {
    this.isProcessing = false;

    // كل 45 ثانية
    this.interval = 45000;

    this.timer = null;
  }

  // =========================================================
  // START
  // =========================================================

  start() {
    console.log(
      '🚀 Atomic Worker Started...'
    );

    // أول دورة مباشرة
    this.processNextTask();

    // منع إنشاء أكثر من interval
    if (!this.timer) {
      this.timer =
        setInterval(
          () =>
            this.processNextTask(),
          this.interval
        );
    }
  }

  // =========================================================
  // PROCESSING KEY
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
  // WAS PROCESSED
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
  // MARK PROCESSED
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
  // GET AVAILABLE POSTS
  // =========================================================

  async _getAvailablePosts(
    job,
    cookieAccount
  ) {
    const allPosts =
      await facebookService
        .discoverPendingPosts(
          cookieAccount.cookies,
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
  // MAIN TASK
  // =========================================================

  async processNextTask() {
    if (this.isProcessing) {
      console.log(
        '⏳ Previous task still processing...'
      );

      return;
    }

    this.isProcessing = true;

    try {
      console.log(
        '\n==============================================='
      );

      console.log(
        '⚙️ ATOMIC WORKER TASK'
      );

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
        console.log(
          'ℹ️ No running job.'
        );

        return;
      }

      console.log(
        `📌 Progress: ${job.completedCount}/${job.totalTarget}`
      );

      console.log(
        `🌐 Group: ${job.groupUrl}`
      );

      console.log(
        `🏷️ Hashtag: ${job.customHashtag}`
      );

      console.log(
        '==============================================='
      );

      // -----------------------------------------------------
      // 2. Target completed
      // -----------------------------------------------------

      if (
        Number(
          job.completedCount || 0
        ) >=
        Number(
          job.totalTarget || 0
        )
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
      // 3. Get VALID Facebook account
      // -----------------------------------------------------

      console.log(
        '🍪 Checking Facebook cookie accounts...'
      );

      const cookieAccount =
        await cookieManager
          .getValidActiveAccount();

      // -----------------------------------------------------
      // No valid account
      // -----------------------------------------------------

      if (!cookieAccount) {
        console.error(
          '❌ لا يوجد حساب Facebook ACTIVE يحتوي على كوكيز صالحة.'
        );

        console.error(
          '❌ المهمة متوقفة حتى يتم إضافة Cookie Set صحيح.'
        );

        return;
      }

      const activeCookieDoc =
        cookieAccount.document;

      console.log(
        `👤 Using Facebook account: "${cookieAccount.accountName}"`
      );

      console.log(
        `🍪 Cookie count: ${cookieAccount.cookies.length}`
      );

      console.log(
        `🍪 Cookies: ${cookieAccount.validation.cookieNames.join(', ')}`
      );

      // -----------------------------------------------------
      // 4. Find target post
      // -----------------------------------------------------

      let targetPostUrl =
        null;

      // -----------------------------------------------------
      // Existing pending posts
      // -----------------------------------------------------

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
      // Discover new posts
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

      console.log(
        '📖 Reading Facebook post...'
      );

      const postText =
        await facebookService
          .fetchPostText(
            cookieAccount.cookies,
            targetPostUrl
          );

      if (!postText) {
        throw new Error(
          'POST_TEXT_ERROR: لم يتم العثور على نص المنشور'
        );
      }

      console.log(
        `📖 Post text length: ${postText.length}`
      );

      // -----------------------------------------------------
      // 6. Gemini
      // -----------------------------------------------------

      console.log(
        '🤖 Generating AI comment...'
      );

      const aiComment =
        await geminiService
          .generateSmartComment(
            postText,
            process.env.GEMINI_API_KEY
          );

      if (
        !aiComment ||
        !String(aiComment).trim()
      ) {
        throw new Error(
          'GEMINI_ERROR: Gemini لم يُرجع تعليقاً صالحاً'
        );
      }

      console.log(
        `🤖 AI comment generated: ${String(aiComment).length} chars`
      );

      // -----------------------------------------------------
      // 7. Submit comments
      // -----------------------------------------------------

      console.log(
        '💬 Submitting Facebook comments...'
      );

      await facebookService
        .submitDualComments(
          cookieAccount.cookies,
          targetPostUrl,
          aiComment,
          job.customHashtag
        );

      // -----------------------------------------------------
      // 8. Mark processed
      // -----------------------------------------------------

      await this._markAsProcessed(
        job,
        targetPostUrl,
        job.customHashtag
      );

      // -----------------------------------------------------
      // 9. Progress
      // -----------------------------------------------------

      job.completedCount =
        Number(
          job.completedCount || 0
        ) + 1;

      await job.save();

      // -----------------------------------------------------
      // Update cookie usage
      // -----------------------------------------------------

      await cookieManager
        .updateCookieUsage(
          activeCookieDoc._id
        );

      console.log(
        `🎉 [${job.completedCount}/${job.totalTarget}] تم التعليق بنجاح`
      );

      console.log(
        `👤 Account: ${cookieAccount.accountName}`
      );

      console.log(
        `📌 Post: ${targetPostUrl}`
      );

      console.log(
        `🏷️ Hashtag: ${job.customHashtag}`
      );

    } catch (error) {
      console.error(
        '\n==============================================='
      );

      console.error(
        '⚠️ ATOMIC WORKER ERROR'
      );

      console.error(
        `TYPE: ${error?.name || 'Unknown'}`
      );

      console.error(
        `MESSAGE: ${error?.message || error}`
      );

      if (error?.stack) {
        console.error(
          'STACK:'
        );

        console.error(
          error.stack
        );
      }

      console.error(
        '===============================================\n'
      );

    } finally {
      this.isProcessing =
        false;

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
