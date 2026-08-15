const JobState = require('../models/JobState');
const cookieManagerService = require('./cookieManager.service');
const facebookService = require('./facebook.service');
const geminiService = require('./gemini.service');

class JobService {
  
  async getOrCreateJob() {
    let job = await JobState.findOne({ jobId: 'main_job' });
    if (!job) {
      job = await JobState.create({
        jobId: 'main_job',
        isRunning: false,
        totalTarget: 0,
        completedCount: 0,
        pendingPosts: [],
        visitedPosts: []
      });
    }
    return job;
  }

  async startNewJob(targetCount, groupUrl, customHashtag) {
    let job = await this.getOrCreateJob();
    job.isRunning = true;
    job.totalTarget = targetCount;
    job.completedCount = 0;
    job.groupUrl = groupUrl;
    job.customHashtag = customHashtag;
    job.pendingPosts = [];
    await job.save();
    console.log(`🚀 Job started: ${targetCount} posts, group: ${groupUrl}`);
    return job;
  }

  async stopJob() {
    let job = await this.getOrCreateJob();
    job.isRunning = false;
    job.pendingPosts = [];
    await job.save();
    console.log('🛑 Job stopped');
    return job;
  }

  // =========================================================
  // ✅ GET NEXT TARGET (identity + post)
  // =========================================================

  async getNextTarget() {
    const identity = await cookieManagerService.getNextAvailableIdentity();
    if (!identity) {
      console.log('⏳ No available identity');
      return null;
    }

    const job = await this.getOrCreateJob();
    if (!job.isRunning) {
      console.log('⏳ Job is not running');
      return null;
    }

    if (job.completedCount >= job.totalTarget) {
      console.log('✅ Job completed');
      job.isRunning = false;
      await job.save();
      return null;
    }

    // جلب منشور تالٍ
    let postUrl = null;
    if (job.pendingPosts.length > 0) {
      postUrl = job.pendingPosts.shift();
    } else {
      // اكتشاف منشورات جديدة
      const activeAccount = await cookieManagerService.getValidActiveAccount();
      if (activeAccount && activeAccount.cookies) {
        const posts = await facebookService.discoverPendingPosts(
          activeAccount.cookies,
          job.groupUrl,
          job.visitedPosts
        );
        if (posts && posts.length > 0) {
          job.pendingPosts = posts;
          postUrl = job.pendingPosts.shift();
        }
      }
    }

    if (!postUrl) {
      console.log('⏳ No posts available');
      return null;
    }

    await job.save();

    return {
      identity,
      postUrl,
      job
    };
  }

  // =========================================================
  // ✅ EXECUTE NEXT TASK
  // =========================================================

  async executeNextTask() {
    try {
      const target = await this.getNextTarget();
      if (!target) {
        return;
      }

      const { identity, postUrl, job } = target;
      console.log(`🎯 Target: ${identity.type} ${identity.accountName} - Post: ${postUrl}`);

      // جلب نص المنشور
      let postText;
      try {
        postText = await facebookService.fetchPostText(identity.cookies, postUrl);
      } catch (error) {
        console.error(`❌ Failed to fetch post text: ${error.message}`);
        // محاولة مع حساب آخر
        const fallbackAccount = await cookieManagerService.getValidActiveAccount();
        if (fallbackAccount && fallbackAccount.cookies) {
          postText = await facebookService.fetchPostText(fallbackAccount.cookies, postUrl);
        } else {
          postText = 'منشور تفاعلي';
        }
      }

      // توليد تعليق
      const aiComment = await geminiService.generateSmartComment(
        postText,
        process.env.GEMINI_API_KEY
      );

      // التعليق حسب نوع الهوية
      let success = false;
      try {
        if (identity.type === 'page') {
          success = await facebookService.submitCommentAsPage(
            identity.cookies,
            postUrl,
            aiComment,
            identity.pageId
          );
        } else {
          success = await facebookService.submitDualComments(
            identity.cookies,
            postUrl,
            aiComment,
            job.customHashtag
          );
        }
      } catch (error) {
        console.error(`❌ Comment submission failed: ${error.message}`);
        // إذا فشل، حاول التعليق كحساب شخصي عادي
        if (identity.type === 'page') {
          const fallback = await cookieManagerService.getValidActiveAccount();
          if (fallback && fallback.cookies) {
            success = await facebookService.submitDualComments(
              fallback.cookies,
              postUrl,
              aiComment,
              job.customHashtag
            );
          }
        }
      }

      if (success) {
        // تحديث الإحصائيات
        await cookieManagerService.updateIdentityUsage(identity);
        job.visitedPosts.push(postUrl);
        job.completedCount += 1;
        await job.save();

        // ضبط كولداون حسب نوع الهوية
        const cooldownMinutes = identity.type === 'page' ? 5 : 10;
        await cookieManagerService.setCooldown(identity, cooldownMinutes);

        console.log(`🎉 [${job.completedCount}/${job.totalTarget}] ${identity.type === 'page' ? '📄' : '👤'} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''} commented on: ${postUrl}`);
      } else {
        console.error(`❌ Failed to comment on: ${postUrl}`);
        // إعادة المنشور إلى القائمة
        if (!job.pendingPosts.includes(postUrl)) {
          job.pendingPosts.push(postUrl);
          await job.save();
        }
      }

    } catch (error) {
      console.error(`❌ executeNextTask error: ${error.message}`);
    }
  }

  // =========================================================
  // ✅ RUN CONTINUOUSLY
  // =========================================================

  async runLoop() {
    console.log('🔄 Job service running...');
    while (true) {
      try {
        await this.executeNextTask();
      } catch (error) {
        console.error(`❌ Loop error: ${error.message}`);
      }
      // انتظار بين المهام
      await new Promise(resolve => setTimeout(resolve, 15000));
    }
  }
}

module.exports = new JobService();
