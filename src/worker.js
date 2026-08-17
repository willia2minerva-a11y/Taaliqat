const JobState = require('./models/JobState');
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
      await new Promise(resolve => setTimeout(resolve, 30000));
    }
  }

  async processNextTask() {
    if (this.isProcessing) return;

    try {
      this.isProcessing = true;

      const job = await JobState.findOne({ jobId: 'main_job' });
      if (!job || !job.isRunning) {
        this.isProcessing = false;
        return;
      }

      if (job.completedCount >= job.totalTarget) {
        job.isRunning = false;
        job.status = 'COMPLETED';
        job.pendingPosts = [];
        await job.save();
        console.log('✅ اكتملت المهمة بنجاح!');
        this.isProcessing = false;
        return;
      }

      // ✅ تنفيذ المهمة مع timeout
      await this._executeWithTimeout(job);

    } catch (error) {
      console.error(`⚠️ خطأ أثناء تنفيذ المهمة الذرية: ${error.message}`);
      
      // ✅ تحديث حالة المهمة حسب نوع الخطأ
      const job = await JobState.findOne({ jobId: 'main_job' });
      if (job && job.isRunning) {
        if (error.message.includes('AUTHENTICATION_ERROR')) {
          job.isRunning = false;
          job.status = 'AUTH_FAILED';
          job.errorReason = error.message;
          await job.save();
          console.log('🔐 Authentication failed. Job stopped.');
        } else if (error.message.includes('NO_VALID_ACCOUNT')) {
          job.isRunning = false;
          job.status = 'NO_ACCOUNT';
          job.errorReason = error.message;
          await job.save();
          console.log('❌ No valid account. Job stopped.');
        }
      }
    } finally {
      this.isProcessing = false;
      if (global.gc) {
        global.gc();
      }
    }
  }

  async _executeWithTimeout(job) {
    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        reject(new Error('TASK_TIMEOUT'));
      }, 90000);

      jobService.executeNextTask()
        .then(resolve)
        .catch(reject)
        .finally(() => {
          clearTimeout(timeout);
        });
    });
  }

  stop() {
    this.isRunning = false;
    console.log('🛑 Worker stopped');
  }
}

module.exports = new AtomicWorker();
