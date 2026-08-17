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
    // ✅ استخدام الحساب الشخصي فقط لاكتشاف المنشورات
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
      await job.save();
      return null;
    }

    // جلب منشور تالٍ
    let postUrl = null;
    if (job.pendingPosts.length > 0) {
      postUrl = job.pendingPosts.shift();
    } else {
      // ✅ اكتشاف منشورات جديدة باستخدام الحساب الشخصي فقط
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

    // ✅ اختيار هوية للتعليق (يمكن أن تكون صفحة أو حساب شخصي)
    const identity = await cookieManagerService.getNextAvailableIdentity();
    if (!identity) {
      console.log('⏳ No available identity for commenting');
      // إعادة المنشور إلى القائمة
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
  // ✅ EXECUTE NEXT TASK WITH ERROR HANDLING
  // =========================================================

  async executeNextTask() {
    try {
      const target = await this.getNextTarget();
      if (!target) {
        return;
      }

      const { identity, postUrl, job } = target;
      console.log(`🎯 Target: ${identity.type} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''} - Post: ${postUrl}`);

      // جلب نص المنشور
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

      // توليد تعليق
      const aiComment = await geminiService.generateSmartComment(
        postText,
        process.env.GEMINI_API_KEY
      );

      // ✅ التعليق مع معالجة الأخطاء وإرسال التقارير
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
        // تحديث الإحصائيات
        await cookieManagerService.updateIdentityUsage(identity);
        job.visitedPosts.push(postUrl);
        job.completedCount += 1;
        await job.save();

        // ضبط كولداون
        const cooldownMinutes = identity.type === 'page' ? 5 : 10;
        await cookieManagerService.setCooldown(identity, cooldownMinutes);

        console.log(`🎉 [${job.completedCount}/${job.totalTarget}] ${identity.type === 'page' ? '📄' : '👤'} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''} commented on: ${postUrl}`);
      } else {
        console.log(`⏭️ Skipped identity: ${identity.type} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''}`);
        
        // ✅ إعادة المنشور إلى القائمة لتجربة هوية أخرى
        if (!job.pendingPosts.includes(postUrl)) {
          job.pendingPosts.push(postUrl);
          await job.save();
        }
      }

    } catch (error) {
      console.error(`❌ executeNextTask error: ${error.message}`);
    }
  }
}

module.exports = new JobService();
