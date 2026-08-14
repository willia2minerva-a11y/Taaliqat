// src/controllers/webhook.controller.js
const config = require('../config');
const jobService = require('../services/job.service');
const messengerService = require('../services/messenger.service');

class WebhookController {
  // ✅ التحقق من Webhook (GET) - دعم صيغ متعددة
  verifyWebhook(req, res) {
    console.log('📥 Webhook verification request received');
    console.log('📋 Query params:', req.query);

    // ✅ دعم كل من الصيغ: hub.verify_token و hub_verify_token
    const mode = req.query['hub.mode'] || req.query.hub_mode;
    const token = req.query['hub.verify_token'] || req.query.hub_verify_token;
    const challenge = req.query['hub.challenge'] || req.query.hub_challenge;

    console.log(`🔍 Mode: ${mode}`);
    console.log(`🔐 Token received: ${token}`);
    console.log(`🔑 Expected token: ${config.verifyToken}`);

    // التحقق من وجود المعاملات
    if (!mode || !token) {
      console.log('❌ Missing mode or token');
      return res.status(400).send('Missing hub.mode or hub.verify_token');
    }

    // ✅ التحقق من صحة الرمز
    if (mode === 'subscribe' && token === config.verifyToken) {
      console.log('✅ WEBHOOK_VERIFIED successfully!');
      return res.status(200).send(challenge);
    } else {
      console.log(`❌ Verification failed: Token mismatch`);
      console.log(`Expected: ${config.verifyToken}, Received: ${token}`);
      return res.status(403).send('Forbidden: Token mismatch');
    }
  }

  // ✅ معالجة الأحداث الواردة (POST)
  async handleWebhookEvent(req, res) {
    const body = req.body;
    console.log('📨 Webhook event received');

    // التحقق من صحة الحدث
    if (!body.object || body.object !== 'page') {
      console.log('❌ Invalid webhook object:', body.object);
      return res.status(404).send('Invalid webhook object');
    }

    // معالجة كل حدث
    for (const entry of body.entry) {
      if (!entry.messaging || !Array.isArray(entry.messaging)) {
        console.log('⚠️ No messaging events found');
        continue;
      }

      for (const webhookEvent of entry.messaging) {
        const senderPsid = webhookEvent.sender?.id;
        
        if (!senderPsid) {
          console.log('⚠️ No sender ID found');
          continue;
        }

        console.log(`👤 Sender PSID: ${senderPsid}`);

        // معالجة الرسائل النصية
        if (webhookEvent.message && webhookEvent.message.text) {
          const messageText = webhookEvent.message.text.trim();
          console.log(`💬 Message: ${messageText}`);
          await this._processCommand(senderPsid, messageText);
        } 
        // معالجة الـ Postbacks
        else if (webhookEvent.postback && webhookEvent.postback.payload) {
          console.log(`📌 Postback: ${webhookEvent.postback.payload}`);
          await this._processCommand(senderPsid, webhookEvent.postback.payload);
        }
      }
    }

    return res.status(200).send('EVENT_RECEIVED');
  }

  // ✅ معالجة الأوامر
  async _processCommand(senderId, text) {
    console.log(`⚙️ Processing command: "${text}" from ${senderId}`);

    try {
      // أمر تشغيل البوت
      if (text.startsWith('/تشغيل')) {
        const parts = text.split(' ');
        const count = parseInt(parts[1]) || 10;
        const groupUrl = parts[2] || config.fbGroupUrl || 'https://www.facebook.com/groups/example';
        const hashtag = parts.slice(3).join(' ') || '#تفاعل';

        await jobService.startNewJob(count, groupUrl, hashtag);
        await messengerService.sendTextMessage(
          senderId, 
          `🚀 تم تشغيل البوت بنجاح!\n📊 العدد: ${count}\n🔗 المجموعة: ${groupUrl}\n🏷️ الهاشتاج: ${hashtag}`
        );
        console.log(`✅ Job started for ${senderId}`);
      } 
      // أمر إيقاف البوت
      else if (text === '/ايقاف' || text === '/stop') {
        await jobService.stopJob();
        await messengerService.sendTextMessage(
          senderId,
          '🛑 تم إيقاف البوت وإلغاء جميع المهام المعلقة.'
        );
        console.log(`✅ Job stopped for ${senderId}`);
      } 
      // أمر الحالة
      else if (text === '/حالة' || text === '/status') {
        const job = await jobService.getOrCreateJob();
        const status = job.isRunning ? '🟢 يعمل' : '🔴 متوقف';
        const progress = job.totalTarget > 0 
          ? `${job.completedCount}/${job.totalTarget}` 
          : '0';

        await messengerService.sendTextMessage(
          senderId,
          `📊 حالة البوت:\n` +
          `الحالة: ${status}\n` +
          `التقدم: ${progress}\n` +
          `المجموعة: ${job.groupUrl || 'غير محددة'}\n` +
          `الهاشتاج: ${job.customHashtag || 'غير محدد'}`
        );
        console.log(`✅ Status sent to ${senderId}`);
      } 
      // أوامر غير معروفة
      else {
        await messengerService.sendTextMessage(
          senderId,
          '❓ الأمر غير معروف. الأوامر المتاحة:\n' +
          '📌 /تشغيل [العدد] [رابط_المجموعة] [الهاشتاج]\n' +
          '📌 /ايقاف\n' +
          '📌 /حالة'
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
