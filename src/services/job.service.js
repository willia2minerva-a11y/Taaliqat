const JobState = require('../models/JobState');
const cookieManagerService = require('./cookieManager.service');
const facebookService = require('./facebook.service');
const geminiService = require('./gemini.service');
const messengerService = require('./messenger.service');

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
    job.status = 'RUNNING';
    job.totalTarget = targetCount;
    job.completedCount = 0;
    job.groupUrl = groupUrl;
    job.customHashtag = customHashtag;
    job.pendingPosts = [];
    job.errorReason = null;
    await job.save();
    console.log(`🚀 Job started: ${targetCount} posts, group: ${groupUrl}`);
    return job;
  }

  async stopJob() {
    let job = await this.getOrCreateJob();
    job.isRunning = false;
    job.status = 'STOPPED';
    job.pendingPosts = [];
    await job.save();
    console.log('🛑 Job stopped');
    return job;
  }

  // =========================================================
  // GET NEXT TARGET
  // =========================================================

  async getNextTarget() {
    const account = await cookieManagerService.getValidActiveAccount();
    if (!account || !account.cookies) {
      console.log('⏳ No valid active account available for discovery');
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
      job.status = 'COMPLETED';
      await job.save();
      return null;
    }

    let postUrl = null;
    if (job.pendingPosts.length > 0) {
      postUrl = job.pendingPosts.shift();
    } else {
      const posts = await facebookService.discoverPendingPosts(
        account.cookies,
        job.groupUrl,
        job.visitedPosts
      );
      if (posts && posts.length > 0) {
        job.pendingPosts = posts;
        postUrl = job.pendingPosts.shift();
      }
    }

    if (!postUrl) {
      console.log('⏳ No posts available');
      return null;
    }

    await job.save();

    const identity = await cookieManagerService.getNextAvailableIdentity();
    if (!identity) {
      console.log('⏳ No available identity for commenting');
      job.pendingPosts.unshift(postUrl);
      await job.save();
      return null;
    }

    return {
      identity,
      postUrl,
      job,
      account
    };
  }

  // =========================================================
  // EXECUTE NEXT TASK
  // =========================================================

  async executeNextTask() {
    try {
      const target = await this.getNextTarget();
      if (!target) {
        return;
      }

      const { identity, postUrl, job } = target;
      console.log(`🎯 Target: ${identity.type} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''} - Post: ${postUrl}`);

      let postText;
      try {
        postText = await facebookService.fetchPostText(identity.cookies, postUrl);
      } catch (error) {
        console.error(`❌ Failed to fetch post text: ${error.message}`);
        const fallbackAccount = await cookieManagerService.getValidActiveAccount();
        if (fallbackAccount && fallbackAccount.cookies) {
          postText = await facebookService.fetchPostText(fallbackAccount.cookies, postUrl);
        } else {
          postText = 'منشور تفاعلي';
        }
      }

      const aiComment = await geminiService.generateSmartComment(
        postText,
        process.env.GEMINI_API_KEY
      );

      const adminId = process.env.ADMIN_FB_ID || process.env.ADMIN_ID;
      const success = await facebookService.submitCommentWithErrorHandling(
        identity,
        postUrl,
        aiComment,
        job.customHashtag,
        messengerService,
        adminId
      );

      if (success) {
        await cookieManagerService.updateIdentityUsage(identity);
        job.visitedPosts.push(postUrl);
        job.completedCount += 1;
        await job.save();

        const cooldownMinutes = identity.type === 'page' ? 5 : 10;
        await cookieManagerService.setCooldown(identity, cooldownMinutes);

        console.log(`🎉 [${job.completedCount}/${job.totalTarget}] ${identity.type === 'page' ? '📄' : '👤'} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''} commented on: ${postUrl}`);
      } else {
        console.log(`⏭️ Skipped identity: ${identity.type} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''}`);
        
        if (!job.pendingPosts.includes(postUrl)) {
          job.pendingPosts.push(postUrl);
          await job.save();
        }
      }

    } catch (error) {
      console.error(`❌ executeNextTask error: ${error.message}`);
      
      // ✅ تصنيف الأخطاء وتحديث حالة المهمة
      const job = await this.getOrCreateJob();
      if (error.message.includes('AUTHENTICATION_ERROR') || error.message.includes('LOGIN_PAGE')) {
        job.isRunning = false;
        job.status = 'AUTH_FAILED';
        job.errorReason = error.message;
        await job.save();
        console.log(`🔐 Authentication failed. Job marked as AUTH_FAILED`);
      } else if (error.message.includes('NO_VALID_ACCOUNT')) {
        job.isRunning = false;
        job.status = 'NO_ACCOUNT';
        job.errorReason = error.message;
        await job.save();
        console.log(`❌ No valid account. Job marked as NO_ACCOUNT`);
      }
    }
  }
}

module.exports = new JobService();
