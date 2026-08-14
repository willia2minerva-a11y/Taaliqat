// src/controllers/webhook.controller.js
const config = require('../config');
const jobService = require('../services/job.service');
const messengerService = require('../services/messenger.service');
const cookieManagerService = require('../services/cookieManager.service');
const facebookService = require('../services/facebook.service');

class WebhookController {
  verifyWebhook(req, res) {
    console.log('📥 Webhook verification request received');
    console.log('📋 Query params:', req.query);

    const mode = req.query['hub.mode'] || req.query.hub_mode;
    const token = req.query['hub.verify_token'] || req.query.hub_verify_token;
    const challenge = req.query['hub.challenge'] || req.query.hub_challenge;

    console.log(`🔍 Mode: ${mode}`);
    console.log(`🔐 Token received: ${token}`);
    console.log(`🔑 Expected token: ${config.verifyToken}`);

    if (!mode || !token) {
      console.log('❌ Missing mode or token');
      return res.status(400).send('Missing hub.mode or hub.verify_token');
    }

    if (mode === 'subscribe' && token === config.verifyToken) {
      console.log('✅ WEBHOOK_VERIFIED successfully!');
      return res.status(200).send(challenge);
    } else {
      console.log(`❌ Verification failed: Token mismatch`);
      return res.status(403).send('Forbidden: Token mismatch');
    }
  }

  async handleWebhookEvent(req, res) {
    const body = req.body;
    console.log('📨 Webhook event received');

    if (!body.object || body.object !== 'page') {
      return res.status(404).send('Invalid webhook object');
    }

    for (const entry of body.entry) {
      if (!entry.messaging) continue;

      for (const webhookEvent of entry.messaging) {
        const senderPsid = webhookEvent.sender?.id;
        if (!senderPsid) continue;

        if (webhookEvent.message?.text) {
          await this._processCommand(senderPsid, webhookEvent.message.text.trim());
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  }

  async _processCommand(senderId, text) {
    console.log(`⚙️ Processing command: "${text}" from ${senderId}`);

    try {
      // ============================================
      // 📌 أمر تشغيل البوت (مع المدة الزمنية)
      // ============================================
      if (text.startsWith('/تشغيل')) {
        const parts = text.split(' ');
        const count = parseInt(parts[1]) || 100;
        const hours = parseInt(parts[2]) || 1;
        const comment = parts.slice(3).join(' ') || '✯⁠[#عشيرة_البيجو]✯⁠';

        await jobService.startNewJob(count, config.fbGroupUrl, comment);
        
        await messengerService.sendTextMessage(
          senderId,
          `🚀 تم إطلاق المهمة بنجاح!\n\n` +
          `• المنشورات المستهدفة: ${count}\n` +
          `• المدة الزمنية: ${hours} ساعة\n` +
          `• نص التعليق: ${comment}`
        );
      }

      // ============================================
      // ⏹️ أمر إيقاف البوت
      // ============================================
      else if (text === '/ايقاف' || text === '/stop') {
        await jobService.stopJob();
        await messengerService.sendTextMessage(
          senderId,
          '🛑 تم إيقاف البوت وإلغاء جميع المهام المعلقة.'
        );
      }

      // ============================================
      // 📊 أمر عرض الحالة
      // ============================================
      else if (text === '/حالة' || text === '/status') {
        const job = await jobService.getOrCreateJob();
        const status = job.isRunning ? '🟢 نشط' : '🔴 متوقف';
        const progress = job.totalTarget > 0 
          ? `${job.completedCount} / ${job.totalTarget}` 
          : '0 / 0';

        const activeCookies = await cookieManagerService.getActiveCookies();
        const allCookies = await cookieManagerService.getAllCookies();
        const activeCount = allCookies.filter(c => c.status === 'ACTIVE').length;
        const blockedCount = allCookies.filter(c => c.status === 'BLOCKED').length;

        await messengerService.sendTextMessage(
          senderId,
          `📊 **حالة النظام الحالية:**\n\n` +
          `• حالة المهمة: ${status}\n` +
          `• نسبة الإنجاز: ${progress}\n` +
          `• الحسابات النشطة: ${activeCount}\n` +
          `• الحسابات المعطلة: ${blockedCount}`
        );
      }

      // ============================================
      // 💬 عرض روابط آخر المنشورات
      // ============================================
      else if (text === '/التعليقات' || text === '/comments') {
        const Post = require('../models/Post');
        const posts = await Post.find().sort({ createdAt: -1 }).limit(10);
        
        if (posts.length === 0) {
          await messengerService.sendTextMessage(
            senderId,
            '📭 لا توجد تعليقات مسجلة حتى الآن.'
          );
        } else {
          let message = '💬 **آخر المنشورات التي تم التعليق عليها:**\n\n';
          posts.forEach((post, index) => {
            message += `${index + 1}. ${post.postUrl}\n`;
          });
          await messengerService.sendTextMessage(senderId, message);
        }
      }

      // ============================================
      // 🔑 إضافة كوكيز جديدة
      // ============================================
      else if (text.startsWith('/كوكيز')) {
        const parts = text.split(' ');
        const accountName = parts[1];
        const cookieString = parts.slice(2).join(' ');

        if (!accountName || !cookieString) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة الصحيحة:\n/كوكيز [اسم_الحساب] [الكوكيز]'
          );
          return;
        }

        const cookies = cookieString.split('; ').map(cookie => {
          const [name, value] = cookie.split('=');
          return { name, value, domain: '.facebook.com', path: '/' };
        });

        await cookieManagerService.addCookies(accountName, cookies);
        await messengerService.sendTextMessage(
          senderId,
          `✅ تم إضافة حساب **${accountName}** بنجاح!`
        );
      }

      // ============================================
      // 👥 عرض جميع الحسابات
      // ============================================
      else if (text === '/الحسابات' || text === '/accounts') {
        const allCookies = await cookieManagerService.getAllCookies();
        
        if (allCookies.length === 0) {
          await messengerService.sendTextMessage(
            senderId,
            '📭 لا توجد حسابات مسجلة.'
          );
          return;
        }

        let message = '📜 **قائمة الحسابات المسجلة:**\n\n';
        allCookies.forEach(cookie => {
          const status = cookie.status === 'ACTIVE' ? '🟢' : '🔴';
          message += `${status} ${cookie.accountName}\n`;
        });

        message += '\n💡 لحذف حساب محدد: /حذف [اسم_الحساب]\n';
        message += '💡 لتنظيف الأحمر: /حذف_غير_نشط';

        await messengerService.sendTextMessage(senderId, message);
      }

      // ============================================
      // 🗑️ حذف حساب محدد
      // ============================================
      else if (text.startsWith('/حذف')) {
        const parts = text.split(' ');
        const accountName = parts[1];

        if (!accountName) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة الصحيحة:\n/حذف [اسم_الحساب]'
          );
          return;
        }

        const result = await Cookie.findOneAndDelete({ accountName });
        if (result) {
          await messengerService.sendTextMessage(
            senderId,
            `✅ تم حذف حساب **${accountName}** بنجاح.`
          );
        } else {
          await messengerService.sendTextMessage(
            senderId,
            `❌ لم يتم العثور على حساب باسم **${accountName}**.`
          );
        }
      }

      // ============================================
      // 🧹 حذف الحسابات غير النشطة
      // ============================================
      else if (text === '/حذف_غير_نشط' || text === '/clean') {
        const result = await Cookie.deleteMany({ status: 'BLOCKED' });
        await messengerService.sendTextMessage(
          senderId,
          `🧹 تم حذف **${result.deletedCount}** حساب غير نشط.`
        );
      }

      // ============================================
      // 📋 عرض السجلات الأخيرة
      // ============================================
      else if (text === '/سجل' || text === '/logs') {
        const JobState = require('../models/JobState');
        const job = await JobState.findOne({ jobId: 'main_job' });
        
        if (!job) {
          await messengerService.sendTextMessage(
            senderId,
            '📭 لا توجد سجلات متاحة.'
          );
          return;
        }

        const lastPosts = job.visitedPosts.slice(-5);
        let message = '📋 **آخر 5 منشورات تم التعليق عليها:**\n\n';
        lastPosts.forEach((post, index) => {
          message += `${index + 1}. ${post}\n`;
        });

        message += `\n📊 إجمالي المنشورات: ${job.visitedPosts.length}`;
        await messengerService.sendTextMessage(senderId, message);
      }

      // ============================================
      // ❓ أوامر غير معروفة - عرض المساعدة
      // ============================================
      else {
        await messengerService.sendTextMessage(
          senderId,
          '🤖 **قائمة الأوامر الشاملة:**\n\n' +
          '▶️ /تشغيل [عدد] [ساعات] [التعليق]\n' +
          '⏹️ /ايقاف - إيقاف المهمة الحالية\n' +
          '📊 /حالة - عرض حالة المهمة\n' +
          '💬 /التعليقات - عرض روابط آخر المنشورات\n' +
          '🔑 /كوكيز [الاسم] [الكوكيز]\n' +
          '👥 /الحسابات - عرض جميع الحسابات\n' +
          '🗑️ /حذف [الاسم] - حذف حساب محدد\n' +
          '🧹 /حذف_غير_نشط - حذف الحسابات الحمراء\n' +
          '📋 /سجل - عرض السجلات الأخيرة'
        );
      }

    } catch (error) {
      console.error(`❌ Command error: ${error.message}`);
      await messengerService.sendTextMessage(
        senderId,
        `❌ حدث خطأ: ${error.message}`
      );
    }
  }
}

module.exports = new WebhookController();
