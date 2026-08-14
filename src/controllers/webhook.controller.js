// src/controllers/webhook.controller.js
const config = require('../config');

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

    // ✅ التحقق من وجود المعاملات
    if (!mode || !token) {
      console.log('❌ Missing mode or token');
      return res.status(400).send('Missing hub.mode or hub.verify_token');
    }

    // ✅ التحقق من صحة الرمز (مع تجاهل حالة الأحرف)
    if (mode === 'subscribe' && token === config.verifyToken) {
      console.log('✅ WEBHOOK_VERIFIED successfully!');
      return res.status(200).send(challenge);
    } else {
      console.log(`❌ Verification failed: Token mismatch`);
      console.log(`Expected: ${config.verifyToken}, Received: ${token}`);
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
    const jobService = require('../services/job.service');
    const messengerService = require('../services/messenger.service');

    try {
      if (text.startsWith('/تشغيل')) {
        const parts = text.split(' ');
        const count = parseInt(parts[1]) || 10;
        const groupUrl = parts[2] || config.fbGroupUrl || 'https://facebook.com/groups/example';
        const hashtag = parts.slice(3).join(' ') || '#تفاعل';

        await jobService.startNewJob(count, groupUrl, hashtag);
        await messengerService.sendTextMessage(
          senderId,
          `🚀 تم تشغيل البوت!\nالعدد: ${count}\nالمجموعة: ${groupUrl}\nالهاشتاج: ${hashtag}`
        );
      } 
      else if (text === '/ايقاف' || text === '/stop') {
        await jobService.stopJob();
        await messengerService.sendTextMessage(senderId, '🛑 تم إيقاف البوت');
      } 
      else if (text === '/حالة' || text === '/status') {
        const job = await jobService.getOrCreateJob();
        await messengerService.sendTextMessage(
          senderId,
          `📊 الحالة: ${job.isRunning ? '🟢 يعمل' : '🔴 متوقف'}\nالتقدم: ${job.completedCount}/${job.totalTarget}`
        );
      } 
      else {
        await messengerService.sendTextMessage(
          senderId,
          '❓ الأوامر:\n/تشغيل [العدد] [الرابط] [الهاشتاج]\n/ايقاف\n/حالة'
        );
      }
    } catch (error) {
      console.error(`❌ Command error: ${error.message}`);
      await messengerService.sendTextMessage(senderId, `❌ خطأ: ${error.message}`);
    }
  }
}

module.exports = new WebhookController();
