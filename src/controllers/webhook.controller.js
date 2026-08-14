// src/controllers/webhook.controller.js
const config = require('../config');
const jobService = require('../services/job.service');
const messengerService = require('../services/messenger.service');

class WebhookController {
  // ✅ التحقق من Webhook (GET)
  verifyWebhook(req, res) {
    console.log('📥 Webhook verification request received');
    console.log('📋 Query params:', req.query);

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    // التحقق من وجود المعاملات المطلوبة
    if (!mode || !token) {
      console.log('❌ Missing mode or token');
      return res.status(400).send('Missing hub.mode or hub.verify_token');
    }

    // التحقق من صحة الرمز
    if (mode === 'subscribe' && token === config.verifyToken) {
      console.log('✅ WEBHOOK_VERIFIED successfully!');
      console.log(`🔢 Challenge: ${challenge}`);
      return res.status(200).send(challenge);
    } else {
      console.log('❌ Verification failed: Token mismatch');
      console.log(`Expected: ${config.verifyToken}, Received: ${token}`);
      return res.sendStatus(403);
    }
  }

  // ✅ معالجة الأحداث الواردة (POST)
  async handleWebhookEvent(req, res) {
    const body = req.body;
    console.log('📨 Webhook event received:', JSON.stringify(body, null, 2));

    // التحقق من أن الحدث من صفحة فيسبوك
    if (!body.object || body.object !== 'page') {
      console.log('❌ Invalid webhook object:', body.object);
      return res.status(404).send('Invalid webhook object');
    }

    // معالجة كل حدث وارد
    for (const entry of body.entry) {
      // التأكد من وجود messaging events
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
        // معالجة الـ Postbacks (الأزرار)
        else if (webhookEvent.postback && webhookEvent.postback.payload) {
          console.log(`📌 Postback: ${webhookEvent.postback.payload}`);
          await this._processCommand(senderPsid, webhookEvent.postback.payload);
        }
        // أي نوع آخر من الأحداث
        else {
          console.log('ℹ️ Unhandled event type:', Object.keys(webhookEvent));
        }
      }
    }

    // فيسبوك يتوقع استجابة 200 OK
    return res.status(200).send('EVENT_RECEIVED');
  }

  // ✅ معالجة الأوامر
  async _processCommand(senderId, text) {
    console.log(`⚙️ Processing command: "${text}" from ${senderId}`);

    // أمر تشغيل البوت
    if (text.startsWith('/تشغيل')) {
      const parts = text.split(' ');
      const count = parseInt(parts[1]) || 10;
      const groupUrl = parts[2] || 'https://www.facebook.com/groups/example';
      const hashtag = parts.slice(3).join(' ') || '#تفاعل';

      try {
        await jobService.startNewJob(count, groupUrl, hashtag);
        await messengerService.sendTextMessage(
          senderId, 
          `🚀 تم تشغيل البوت بنجاح!\n📊 العدد: ${count} منشور\n🔗 المجموعة: ${groupUrl}\n🏷️ الهاشتاج: ${hashtag}`
        );
        console.log(`✅ Job started for ${senderId}`);
      } catch (error) {
        console.error(`❌ Failed to start job: ${error.message}`);
        await messengerService.sendTextMessage(
          senderId,
          `❌ حدث خطأ أثناء تشغيل البوت: ${error.message}`
        );
      }
    } 
    // أمر إيقاف البوت
    else if (text === '/ايقاف') {
      try {
        await jobService.stopJob();
        await messengerService.sendTextMessage(
          senderId,
          '🛑 تم إيقاف البوت وإلغاء جميع المهام المعلقة.'
        );
        console.log(`✅ Job stopped for ${senderId}`);
      } catch (error) {
        console.error(`❌ Failed to stop job: ${error.message}`);
        await messengerService.sendTextMessage(
          senderId,
          `❌ حدث خطأ أثناء إيقاف البوت: ${error.message}`
        );
      }
    } 
    // أمر الحالة
    else if (text === '/حالة') {
      try {
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
      } catch (error) {
        console.error(`❌ Failed to get status: ${error.message}`);
        await messengerService.sendTextMessage(
          senderId,
          `❌ حدث خطأ أثناء جلب الحالة: ${error.message}`
        );
      }
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
  }
}

module.exports = new WebhookController();
