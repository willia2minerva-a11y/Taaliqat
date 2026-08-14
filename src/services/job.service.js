// src/services/job.service.js
const JobState = require('../models/JobState');

class JobService {
  // ✅ الحصول على المهمة أو إنشاؤها
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

  // ✅ بدء مهمة جديدة
  async startNewJob(targetCount, groupUrl, customHashtag) {
    let job = await this.getOrCreateJob();
    job.isRunning = true;
    job.totalTarget = targetCount;
    job.completedCount = 0;
    job.groupUrl = groupUrl;
    job.customHashtag = customHashtag;
    job.pendingPosts = [];
    await job.save();
    return job;
  }

  // ✅ إيقاف المهمة
  async stopJob() {
    let job = await this.getOrCreateJob();
    job.isRunning = false;
    job.pendingPosts = [];
    await job.save();
    return job;
  }

  // ✅ تحديث التقدم
  async updateProgress(postUrl) {
    let job = await this.getOrCreateJob();
    if (job.isRunning) {
      job.completedCount += 1;
      job.visitedPosts.push(postUrl);
      await job.save();
    }
    return job;
  }

  // ✅ إضافة منشورات معلقة
  async addPendingPosts(posts) {
    let job = await this.getOrCreateJob();
    if (job.isRunning) {
      const newPosts = posts.filter(p => !job.visitedPosts.includes(p) && !job.pendingPosts.includes(p));
      job.pendingPosts = [...job.pendingPosts, ...newPosts];
      await job.save();
    }
    return job;
  }

  // ✅ الحصول على منشور تالٍ
  async getNextPendingPost() {
    let job = await this.getOrCreateJob();
    if (job.isRunning && job.pendingPosts.length > 0) {
      return job.pendingPosts.shift();
    }
    return null;
  }

  // ✅ الحصول على حالة المهمة
  async getJobStatus() {
    const job = await this.getOrCreateJob();
    return {
      isRunning: job.isRunning,
      completedCount: job.completedCount,
      totalTarget: job.totalTarget,
      groupUrl: job.groupUrl,
      customHashtag: job.customHashtag,
      pendingCount: job.pendingPosts.length,
      visitedCount: job.visitedPosts.length
    };
  }
}

module.exports = new JobService();
