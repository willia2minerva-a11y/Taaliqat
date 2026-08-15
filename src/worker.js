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
  }

  // =========================================================
  // START
  // =========================================================

  start() {

    console.log(
      '🚀 Atomic Worker Started...'
    );

    // أول تشغيل مباشرة
    this.processNextTask();

    // بعد ذلك كل 45 ثانية
    setInterval(
      () => {
        this.processNextTask();
      },
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

    return (
      `${cleanPost}|||${cleanHashtag}`
    );
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

    // لا تسمح بتضخم MongoDB
    if (
      job.visitedPosts.length > 5000
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

    const accountName =
      cookieAccount?.accountName ||
      'UNKNOWN';

    console.log(
      `🔎 Discovering posts using account: "${accountName}"`
    );

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

      console.log(
        '📭 No posts discovered'
      );

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
      `♻️ Available for "${hashtag}": ${available.length}`
    );

    return available;
  }

  // =========================================================
  // FACEBOOK ERROR CLASSIFICATION
  // =========================================================

  _classifyFacebookError(
    error
  ) {

    const message =
      String(
        error?.message || error || ''
      ).toLowerCase();

    // -------------------------------------------------------
    // Cookie expired / authentication
    // -------------------------------------------------------

    if (
      message.includes(
        'authentication_error'
      ) ||
      message.includes(
        'cookies may be invalid'
      ) ||
      message.includes(
        'requires login'
      ) ||
      message.includes(
        'login page'
      ) ||
      message.includes(
        'checkpoint'
      ) ||
      message.includes(
        'security verification'
      ) ||
      message.includes(
        'cookie'
      )
    ) {

      return 'EXPIRED';
    }

    // -------------------------------------------------------
    // Account / Facebook blocked
    // -------------------------------------------------------

    if (
      message.includes(
        'blocked'
      ) ||
      message.includes(
        'temporarily'
      ) ||
      message.includes(
        'rate limit'
      ) ||
      message.includes(
        'too many'
      )
    ) {

      return 'BLOCKED';
    }

    // -------------------------------------------------------
    // Navigation / browser problem
    //
    // Don't immediately destroy account because
    // Chromium may simply have failed.
    // -------------------------------------------------------

    return 'UNKNOWN';
  }

  // =========================================================
  // TRY DISCOVERY WITH MULTIPLE ACCOUNTS
  // =========================================================

  async _discoverWithAccounts(
    job
  ) {

    console.log(
      '🍪 Checking Facebook cookie accounts...'
    );

    // -------------------------------------------------------
    // IMPORTANT:
    //
    // This method gets ACTIVE accounts one by one.
    // If one fails, we continue to the next.
    // -------------------------------------------------------

    const accounts =
      await cookieManager.getAllCookies();

    const activeAccounts =
      accounts.filter(
        account =>
          account.status === 'ACTIVE'
      );

    console.log(
      `[WORKER] 👥 ACTIVE accounts available: ${activeAccounts.length}`
    );

    if (
      activeAccounts.length === 0
    ) {

      console.warn(
        '[WORKER] ⚠️ No ACTIVE Facebook accounts'
      );

      return {
        posts: [],
        account: null
      };
    }

    for (
      const account
      of activeAccounts
    ) {

      const accountName =
        account.accountName ||
        'UNKNOWN';

      // -----------------------------------------------------
      // Validate structure before Facebook
      // -----------------------------------------------------

      const validation =
        cookieManager
          .validateCookiesDetailed(
            account.cookies
          );

      if (
        !validation.valid
      ) {

        console.warn(
          `[WORKER][COOKIE] ⚠️ Skipping "${accountName}" because cookies are invalid: ${validation.reason}`
        );

        // ---------------------------------------------------
        // Incomplete cookie set
        // ---------------------------------------------------

        if (
          validation.reason ===
          'COOKIES_MISSING_REQUIRED'
        ) {

          await cookieManager.markExpired(
            account._id,
            `Missing required cookies: ${
              validation.missing.join(', ')
            }`
          );

        } else {

          await cookieManager.markExpired(
            account._id,
            validation.reason
          );
        }

        continue;
      }

      // -----------------------------------------------------
      // VALID COOKIE STRUCTURE
      // -----------------------------------------------------

      console.log(
        `\n[WORKER] 🟢 Trying Facebook account: "${accountName}"`
      );

      try {

        const posts =
          await this._getAvailablePosts(
            job,
            account
          );

        // ---------------------------------------------------
        // Account works, even if no posts.
        // ---------------------------------------------------

        await cookieManager
          .updateCookieUsage(
            account._id
          );

        return {
          posts,
          account
        };

      } catch (error) {

        const type =
          this._classifyFacebookError(
            error
          );

        console.error(
          `[WORKER][FACEBOOK] ❌ Account "${accountName}" failed`
        );

        console.error(
          `[WORKER][FACEBOOK] Error: ${error.message}`
        );

        console.error(
          `[WORKER][FACEBOOK] Classification: ${type}`
        );

        // ---------------------------------------------------
        // Expired / invalid session
        // ---------------------------------------------------

        if (
          type === 'EXPIRED'
        ) {

          await cookieManager.markExpired(
            account._id,
            error.message
          );
        }

        // ---------------------------------------------------
        // Blocked
        // ---------------------------------------------------

        else if (
          type === 'BLOCKED'
        ) {

          await cookieManager.markBlocked(
            account._id,
            error.message
          );
        }

        // ---------------------------------------------------
        // UNKNOWN
        //
        // Don't destroy account.
        // Just continue to next one.
        // ---------------------------------------------------

        else {

          console.warn(
            `[WORKER][WARN] ⚠️ Unknown Facebook error for "${accountName}". Account will NOT be deleted.`
          );
        }

        console.log(
          `[WORKER] 🔄 Moving to next Facebook account...`
        );

        continue;
      }
    }

    console.error(
      '[WORKER] ❌ All Facebook accounts failed or were invalid'
    );

    return {
      posts: [],
      account: null
    };
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

    this.isProcessing =
      true;

    try {

      // =====================================================
      // 1. JOB
      // =====================================================

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
        `🏷️ Hashtag: ${job.customHashtag}`
      );

      console.log(
        '==============================================='
      );

      // =====================================================
      // 2. TARGET COMPLETE
      // =====================================================

      if (
        job.completedCount >=
        job.totalTarget
      ) {

        job.isRunning =
          false;

        job.pendingPosts = [];

        await job.save();

        console.log(
          '✅ المهمة اكتملت بنجاح!'
        );

        return;
      }

      // =====================================================
      // 3. FIND TARGET POST
      // =====================================================

      let targetPostUrl =
        null;

      // -----------------------------------------------------
      // First use pending queue
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

      // =====================================================
      // 4. DISCOVER POSTS
      // =====================================================

      let selectedAccount =
        null;

      if (
        !targetPostUrl
      ) {

        const result =
          await this._discoverWithAccounts(
            job
          );

        selectedAccount =
          result.account;

        const availablePosts =
          result.posts;

        if (
          !selectedAccount
        ) {

          console.warn(
            '[WORKER] ⚠️ No Facebook account can currently perform this task.'
          );

          console.warn(
            '[WORKER] 🔄 Worker will retry automatically on next cycle.'
          );

          return;
        }

        if (
          availablePosts.length === 0
        ) {

          console.log(
            '⌛ No new posts available currently.'
          );

          return;
        }

        targetPostUrl =
          availablePosts.shift();

        job.pendingPosts =
          availablePosts;

        await job.save();
      }

      // =====================================================
      // 5. IF WE GOT A QUEUED POST
      // =====================================================

      if (
        !targetPostUrl
      ) {

        console.log(
          '⌛ No target post selected.'
        );

        return;
      }

      console.log(
        `🎯 Selected post: ${targetPostUrl}`
      );

      console.log(
        `🏷️ Hashtag: ${job.customHashtag}`
      );

      // =====================================================
      // 6. GET A VALID ACCOUNT FOR POST
      // =====================================================

      if (
        !selectedAccount
      ) {

        selectedAccount =
          await cookieManager
            .getValidActiveAccount();
      }

      if (
        !selectedAccount
      ) {

        console.warn(
          '[WORKER] ⚠️ No valid Facebook account available for post processing.'
        );

        return;
      }

      console.log(
        `👤 Using Facebook account: "${selectedAccount.accountName}"`
      );

      // =====================================================
      // 7. FETCH POST TEXT
      // =====================================================

      let postText;

      try {

        postText =
          await facebookService
            .fetchPostText(
              selectedAccount.cookies,
              targetPostUrl
            );

      } catch (error) {

        const type =
          this._classifyFacebookError(
            error
          );

        console.error(
          `[WORKER][FETCH] ❌ Account "${selectedAccount.accountName}" failed: ${error.message}`
        );

        console.error(
          `[WORKER][FETCH] Classification: ${type}`
        );

        if (
          type === 'EXPIRED'
        ) {

          await cookieManager.markExpired(
            selectedAccount._id,
            error.message
          );

        } else if (
          type === 'BLOCKED'
        ) {

          await cookieManager.markBlocked(
            selectedAccount._id,
            error.message
          );
        }

        // ---------------------------------------------------
        // Don't mark post as processed.
        // Next cycle will retry.
        // ---------------------------------------------------

        return;
      }

      if (
        !postText
      ) {

        throw new Error(
          'POST_TEXT_ERROR: Empty post text'
        );
      }

      console.log(
        `📖 Post text length: ${postText.length}`
      );

      // =====================================================
      // 8. GEMINI
      // =====================================================

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
          'GEMINI_ERROR: Gemini returned empty comment'
        );
      }

      // =====================================================
      // 9. SUBMIT COMMENTS
      // =====================================================

      try {

        await facebookService
          .submitDualComments(
            selectedAccount.cookies,
            targetPostUrl,
            aiComment,
            job.customHashtag
          );

      } catch (error) {

        const type =
          this._classifyFacebookError(
            error
          );

        console.error(
          `[WORKER][COMMENT] ❌ Account "${selectedAccount.accountName}" failed`
        );

        console.error(
          `[WORKER][COMMENT] Error: ${error.message}`
        );

        console.error(
          `[WORKER][COMMENT] Classification: ${type}`
        );

        if (
          type === 'EXPIRED'
        ) {

          await cookieManager.markExpired(
            selectedAccount._id,
            error.message
          );

        } else if (
          type === 'BLOCKED'
        ) {

          await cookieManager.markBlocked(
            selectedAccount._id,
            error.message
          );
        }

        // لا نحسب المنشور كمكتمل
        return;
      }

      // =====================================================
      // 10. MARK PROCESSED
      // =====================================================

      await this._markAsProcessed(
        job,
        targetPostUrl,
        job.customHashtag
      );

      // =====================================================
      // 11. UPDATE PROGRESS
      // =====================================================

      job.completedCount =
        Number(
          job.completedCount || 0
        ) + 1;

      await job.save();

      // =====================================================
      // SUCCESS
      // =====================================================

      console.log(
        `🎉 [${job.completedCount}/${job.totalTarget}] تم التعليق بنجاح`
      );

      console.log(
        `👤 Account: ${selectedAccount.accountName}`
      );

      console.log(
        `📌 Post: ${targetPostUrl}`
      );

      console.log(
        `🏷️ Hashtag: ${job.customHashtag}`
      );

      console.log(
        '==============================================='
      );

    } catch (error) {

      console.error(
        `⚠️ خطأ أثناء تنفيذ المهمة الذرية: ${
          error?.message || error
        }`
      );

      console.error(
        error?.stack || ''
      );

    } finally {

      this.isProcessing =
        false;

      if (
        global.gc
      ) {

        try {
          global.gc();
        } catch {}
      }
    }
  }
}

module.exports =
  new AtomicWorker();
