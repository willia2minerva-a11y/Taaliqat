// src/worker.js

const JobState =
  require('./models/JobState');

const facebookService =
  require('./services/facebook.service');

const cookieManager =
  require('./services/cookieManager.service');

const geminiService =
  require('./services/gemini.service');

class AtomicWorker {

  constructor() {

    this.isProcessing = false;

    // كل 45 ثانية
    this.interval = 45000;
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
      () =>
        this.processNextTask(),
      this.interval
    );
  }

  // =========================================================
  // PROCESSING KEY
  // =========================================================

  _makeProcessingKey(
    postUrl,
    hashtag
  ) {

    const cleanPost =
      String(
        postUrl || ''
      ).trim();

    const cleanHashtag =
      String(
        hashtag || ''
      ).trim();

    return `${cleanPost}|||${cleanHashtag}`;
  }

  // =========================================================
  // CHECK PROCESSED
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
      !job.visitedPosts.includes(
        key
      )
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
    cookieDoc
  ) {

    if (!cookieDoc) {

      throw new Error(
        'COOKIE_ERROR: No valid cookie account was selected.'
      );
    }

    if (
      !Array.isArray(
        cookieDoc.cookies
      ) ||
      cookieDoc.cookies.length === 0
    ) {

      throw new Error(
        `COOKIE_ERROR: Selected account "${cookieDoc.accountName}" has empty cookies.`
      );
    }

    console.log(
      `👤 Using Facebook account: ${cookieDoc.accountName}`
    );

    console.log(
      `🍪 Cookie count: ${cookieDoc.cookies.length}`
    );

    const allPosts =
      await facebookService
        .discoverPendingPosts(
          cookieDoc.cookies,
          job.groupUrl
        );

    if (
      !Array.isArray(
        allPosts
      ) ||
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
      `📊 Found ${allPosts.length} post(s)`
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

    if (
      this.isProcessing
    ) {

      console.log(
        '⏳ Previous task still processing...'
      );

      return;
    }

    try {

      this.isProcessing =
        true;

      // -----------------------------------------------------
      // 1. JOB
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
        `🏷️ Hashtag: ${job.customHashtag || '[EMPTY]'}`
      );

      console.log(
        '===============================================\n'
      );

      // -----------------------------------------------------
      // 2. TARGET
      // -----------------------------------------------------

      if (
        Number(
          job.completedCount || 0
        ) >=
        Number(
          job.totalTarget || 0
        )
      ) {

        job.isRunning =
          false;

        job.pendingPosts =
          [];

        await job.save();

        console.log(
          '✅ المهمة اكتملت بنجاح!'
        );

        return;
      }

      // -----------------------------------------------------
      // 3. SELECT VALID COOKIE ACCOUNT
      // -----------------------------------------------------

      console.log(
        '🍪 Checking Facebook cookie accounts...'
      );

      const activeCookieDoc =
        await cookieManager
          .getActiveCookieDocument();

      if (!activeCookieDoc) {

        console.error(
          '❌ لا يوجد حساب Facebook ACTIVE يحتوي على كوكيز صالحة.'
        );

        console.error(
          '❌ المهمة ستتوقف مؤقتًا حتى يتم إصلاح/إضافة الكوكيز.'
        );

        return;
      }

      console.log(
        `✅ Selected account: ${activeCookieDoc.accountName}`
      );

      console.log(
        `🍪 Cookies available: ${activeCookieDoc.cookies.length}`
      );

      // -----------------------------------------------------
      // 4. TARGET POST
      // -----------------------------------------------------

      let targetPostUrl =
        null;

      // -----------------------------------------------------
      // PENDING QUEUE
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
      // DISCOVER NEW POSTS
      // -----------------------------------------------------

      if (
        !targetPostUrl
      ) {

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

      // -----------------------------------------------------
      // VALIDATE TARGET
      // -----------------------------------------------------

      if (
        !targetPostUrl
      ) {

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
      // 5. FETCH POST
      // -----------------------------------------------------

      console.log(
        `📖 Reading post using account: ${activeCookieDoc.accountName}`
      );

      const postText =
        await facebookService
          .fetchPostText(
            activeCookieDoc.cookies,
            targetPostUrl
          );

      if (
        !postText
      ) {

        throw new Error(
          'POST_TEXT_ERROR: لم يتم العثور على نص المنشور'
        );
      }

      console.log(
        `📖 Post text length: ${postText.length}`
      );

      // -----------------------------------------------------
      // 6. GEMINI
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
        !String(
          aiComment
        ).trim()
      ) {

        throw new Error(
          'AI_ERROR: Gemini did not return a valid comment'
        );
      }

      console.log(
        `🤖 AI comment generated: ${String(aiComment).length} characters`
      );

      // -----------------------------------------------------
      // 7. SUBMIT
      // -----------------------------------------------------

      console.log(
        `💬 Submitting comments using account: ${activeCookieDoc.accountName}`
      );

      await facebookService
        .submitDualComments(
          activeCookieDoc.cookies,
          targetPostUrl,
          aiComment,
          job.customHashtag
        );

      // -----------------------------------------------------
      // 8. MARK PROCESSED
      // -----------------------------------------------------

      await this._markAsProcessed(
        job,
        targetPostUrl,
        job.customHashtag
      );

      // -----------------------------------------------------
      // 9. PROGRESS
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
        `👤 Account: ${activeCookieDoc.accountName}`
      );

      console.log(
        `📌 Post: ${targetPostUrl}`
      );

      console.log(
        `🏷️ Hashtag: ${job.customHashtag}`
      );

    } catch (error) {

      console.error(
        '\n========== ATOMIC WORKER ERROR =========='
      );

      console.error(
        `❌ Message: ${error?.message || error}`
      );

      if (error?.stack) {

        console.error(
          error.stack
        );
      }

      console.error(
        '==========================================\n'
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
