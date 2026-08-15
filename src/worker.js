// src/worker.js

const JobState = require('./models/JobState');
const cookieManager =
  require('./services/cookieManager.service');

const facebookService =
  require('./services/facebook.service');

const geminiService =
  require('./services/gemini.service');

class AtomicWorker {

  constructor() {
    this.isProcessing = false;
    this.interval = 45000;

    // يمنع إعادة تشغيل نفس المهمة بعد فشل
    // جميع الحسابات.
    this.cookiesFailedForJob = false;
  }

  // =========================================================
  // START
  // =========================================================

  start() {
    console.log(
      '🚀 Atomic Worker Started...'
    );

    this.processNextTask();

    setInterval(
      () => this.processNextTask(),
      this.interval
    );
  }

  // =========================================================
  // PROCESS KEY
  // =========================================================

  _makeKey(post, hashtag) {
    return `${String(post).trim()}|||${String(hashtag || '').trim()}`;
  }

  _wasProcessed(job, post, hashtag) {
    return Array.isArray(job.visitedPosts) &&
      job.visitedPosts.includes(
        this._makeKey(post, hashtag)
      );
  }

  async _markProcessed(job, post, hashtag) {
    if (!Array.isArray(job.visitedPosts)) {
      job.visitedPosts = [];
    }

    const key =
      this._makeKey(post, hashtag);

    if (!job.visitedPosts.includes(key)) {
      job.visitedPosts.push(key);
    }

    if (job.visitedPosts.length > 5000) {
      job.visitedPosts =
        job.visitedPosts.slice(-5000);
    }

    await job.save();
  }

  // =========================================================
  // DISCOVER AVAILABLE POSTS
  // =========================================================

  async _getAvailablePosts(job, account) {
    const posts =
      await facebookService.discoverPendingPosts(
        account.cookies,
        job.groupUrl
      );

    if (!Array.isArray(posts)) {
      return [];
    }

    return posts.filter(
      post =>
        !this._wasProcessed(
          job,
          post,
          job.customHashtag
        )
    );
  }

  // =========================================================
  // MAIN
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

      const job =
        await JobState.findOne({
          jobId: 'main_job'
        });

      if (!job || !job.isRunning) {
        return;
      }

      console.log(
        '\n==============================================='
      );

      console.log(
        '⚙️ ATOMIC WORKER TASK'
      );

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
      // إذا فشلت كل الحسابات في هذه المهمة
      // لا نعيد نفس العملية كل 45 ثانية.
      // -----------------------------------------------------

      if (this.cookiesFailedForJob) {
        console.log(
          '🛑 هذه المهمة متوقفة بسبب فشل جميع حسابات Facebook.'
        );
        return;
      }

      // -----------------------------------------------------
      // TARGET
      // -----------------------------------------------------

      if (
        Number(job.completedCount || 0) >=
        Number(job.totalTarget || 0)
      ) {

        job.isRunning = false;
        job.pendingPosts = [];

        await job.save();

        console.log(
          '🎉 المهمة اكتملت بنجاح!'
        );

        return;
      }

      // -----------------------------------------------------
      // FIND VALID ACCOUNT
      // -----------------------------------------------------

      console.log(
        '🍪 Checking Facebook cookie accounts...'
      );

      const accountResult =
        await cookieManager
          .getValidActiveAccount();

      if (!accountResult.account) {

        console.error(
          '==============================================='
        );

        console.error(
          '❌ لا يوجد حساب Facebook ACTIVE يحتوي على Cookie Set صالح.'
        );

        console.error(
          `❌ السبب: ${accountResult.reason}`
        );

        console.error(
          '🛑 سيتم إيقاف المهمة الحالية لمنع التكرار.'
        );

        console.error(
          '==============================================='
        );

        job.isRunning = false;
        await job.save();

        this.cookiesFailedForJob = true;

        return;
      }

      const account =
        accountResult.account;

      console.log(
        `👤 Selected Facebook account: "${account.accountName || 'UNKNOWN'}"`
      );

      // -----------------------------------------------------
      // UPDATE USAGE
      // -----------------------------------------------------

      await cookieManager.updateCookieUsage(
        account._id
      );

      // -----------------------------------------------------
      // PENDING POST
      // -----------------------------------------------------

      let targetPost = null;

      if (
        Array.isArray(job.pendingPosts)
      ) {

        while (
          job.pendingPosts.length
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
            targetPost = candidate;
            break;
          }
        }

        await job.save();
      }

      // -----------------------------------------------------
      // DISCOVER
      // -----------------------------------------------------

      if (!targetPost) {

        console.log(
          '🔎 Searching group posts...'
        );

        const posts =
          await this._getAvailablePosts(
            job,
            account
          );

        if (!posts.length) {

          console.log(
            '⌛ لا توجد منشورات جديدة لهذا الهاشتاغ.'
          );

          return;
        }

        targetPost =
          posts.shift();

        job.pendingPosts =
          posts;

        await job.save();
      }

      console.log(
        `🎯 Selected post: ${targetPost}`
      );

      // -----------------------------------------------------
      // FETCH TEXT
      // -----------------------------------------------------

      const postText =
        await facebookService.fetchPostText(
          account.cookies,
          targetPost
        );

      if (!postText) {
        throw new Error(
          'POST_TEXT_ERROR: Empty post text'
        );
      }

      console.log(
        `📖 Post text: ${postText.length} chars`
      );

      // -----------------------------------------------------
      // GEMINI
      // -----------------------------------------------------

      const aiComment =
        await geminiService.generateSmartComment(
          postText,
          process.env.GEMINI_API_KEY
        );

      if (!aiComment?.trim()) {
        throw new Error(
          'GEMINI_ERROR: Empty AI comment'
        );
      }

      // -----------------------------------------------------
      // COMMENTS
      // -----------------------------------------------------

      await facebookService.submitDualComments(
        account.cookies,
        targetPost,
        aiComment,
        job.customHashtag
      );

      // -----------------------------------------------------
      // SUCCESS
      // -----------------------------------------------------

      await this._markProcessed(
        job,
        targetPost,
        job.customHashtag
      );

      job.completedCount =
        Number(job.completedCount || 0) + 1;

      await job.save();

      console.log(
        `🎉 [${job.completedCount}/${job.totalTarget}] تم التنفيذ بنجاح`
      );

      console.log(
        `👤 Account: ${account.accountName || 'UNKNOWN'}`
      );

    } catch (error) {

      console.error(
        '\n========== ATOMIC WORKER ERROR =========='
      );

      console.error(
        `❌ ${error.message}`
      );

      console.error(
        `STACK:\n${error.stack || 'NO STACK'}`
      );

      console.error(
        '==========================================\n'
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
