const JobState = require('./models/JobState');
const cookieManagerService = require('./services/cookieManager.service');
const jobService = require('./services/job.service');

class AtomicWorker {
  constructor() {
    this.isProcessing = false;
    this.isRunning = true;
  }

  start() {
    console.log('🚀 Atomic Worker Started...');
    this._runLoop();
  }

  async _runLoop() {
    while (this.isRunning) {
      try {
        await this.processNextTask();
      } catch (error) {
        console.error(`⚠️ Worker error: ${error.message}`);
      }
      // انتظار بين المهام
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  async processNextTask() {
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;

      // التحقق من وجود مهمة نشطة
      const job = await JobState.findOne({ jobId: 'main_job' });
      if (!job || !job.isRunning) {
        this.isProcessing = false;
        return;
      }

      if (job.completedCount >= job.totalTarget) {
        job.isRunning = false;
        job.pendingPosts = [];
        await job.save();
        console.log('✅ اكتملت المهمة بنجاح!');
        this.isProcessing = false;
        return;
      }

      // تنفيذ المهمة التالية باستخدام jobService
      await jobService.executeNextTask();

    } catch (error) {
      console.error(`⚠️ خطأ أثناء تنفيذ المهمة الذرية: ${error.message}`);
    } finally {
      this.isProcessing = false;
      if (global.gc) {
        global.gc();
      }
    }
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Worker stopped');
  }
}

module.exports = new AtomicWorker();
