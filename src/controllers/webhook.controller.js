// src/controllers/webhook.controller.js
const JobState = require('../models/JobState');
const Cookie = require('../models/Cookie');
const MessengerService = require('../services/messenger.service');
const { FB_VERIFY_TOKEN, ADMIN_FB_ID } = require('../config');

// قاموس الربط بين الأوامر باللغتين العربية والإنجليزية المفتاح المعياري
const COMMAND_MAP = {
  // Run Command
  '/run': 'run',
  '/تشغيل': 'run',
  '/ابدا': 'run',
  '/ابدأ': 'run',

  // Stop Command
  '/stop': 'stop',
  '/ايقاف': 'stop',
  '/إيقاف': 'stop',
  '/توقف': 'stop',

  // Status Command
  '/status': 'status',
  '/حالة': 'status',
  '/الحالة': 'status',

  // Add Cookie Command
  '/addcookie': 'addcookie',
  '/اضافة_كوكيز': 'addcookie',
  '/إضافة_كوكيز': 'addcookie',
  '/كوكيز': 'addcookie',

  // List Cookies Command
  '/listcookies': 'listcookies',
  '/الحسابات': 'listcookies',
  '/عرض_الحسابات': 'listcookies',

  // Logs Command
  '/logs': 'logs',
  '/سجل': 'logs',
  '/السجلات': 'logs',

  // Help Command
  '/help': 'help',
  '/مساعدة': 'help',
  '/اوامر': 'help',
  '/أوامر': 'help'
};

class WebhookController {
  static verifyWebhook(req, res) {
    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === FB_VERIFY_TOKEN) {
      console.log('✅ Webhook Verified Successfully.');
      return res.status(200).send(challenge);
    }
    return res.sendStatus(403);
  }

  static async handleMessage(req, res) {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry) {
        if (!entry.messaging) continue;
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;

        if (ADMIN_FB_ID && senderId !== ADMIN_FB_ID) {
          console.warn(`⚠️ Unauthorized attempt from PSID: ${senderId}`);
          await MessengerService.sendMessage(senderId, '❌ غير مصرح لك باستخدام هذا البوت.');
          continue;
        }

        if (webhookEvent.message && webhookEvent.message.text) {
          const commandText = webhookEvent.message.text.trim();
          await WebhookController.processCommand(senderId, commandText);
        }
      }
      return res.status(200).send('EVENT_RECEIVED');
    }
    return res.sendStatus(404);
  }

  static async processCommand(senderId, text) {
    const parts = text.split(/\s+/);
    const rawCommand = parts[0].toLowerCase();
    
    // تحويل الأمر العربي أو الإنجليزي إلى المفتاح المعياري
    const command = COMMAND_MAP[rawCommand] || rawCommand;

    try {
      switch (command) {
        case 'run': {
          const targetPosts = parseInt(parts[1]) || 100;
          const hours = parseFloat(parts[2]) || 4;
          const fixedComment = parts.slice(3).join(' ') || '𖢘[#فيلق_الهايبرا]𖢘';

          const totalSeconds = hours * 3600;
          const delayMs = Math.floor((totalSeconds / targetPosts) * 1000);

          await JobState.findOneAndUpdate({}, {
            isRunning: true,
            targetPosts,
            processedPosts: 0,
            durationHours: hours,
            fixedComment,
            delayBetweenPostsMs: Math.max(delayMs, 5000),
            startedAt: new Date()
          }, { upsert: true });

          await MessengerService.sendMessage(senderId, 
            `🚀 تم إطلاق المهمة بنجاح! / Job Started!\n` +
            `- المنشورات / Posts: ${targetPosts}\n` +
            `- المدة / Duration: ${hours}h\n` +
            `- التأخير / Delay: ${(delayMs / 1000).toFixed(1)}s\n` +
            `- التعليق الجامد: ${fixedComment}`
          );
          break;
        }

        case 'stop': {
          await JobState.findOneAndUpdate({}, { isRunning: false });
          await MessengerService.sendMessage(senderId, '🛑 تم إيقاف المهمة / Job Stopped.');
          break;
        }

        case 'status': {
          const state = await JobState.findOne();
          const active = await Cookie.countDocuments({ status: 'ACTIVE' });
          const expired = await Cookie.countDocuments({ status: 'EXPIRED' });
          const cooldown = await Cookie.countDocuments({ status: 'COOLDOWN' });

          const statusMsg = `📊 تقرير الحالة / System Status:\n` +
            `- التشغيل: ${state?.isRunning ? 'نشط 🟢' : 'متوقف 🔴'}\n` +
            `- الإنجاز / Progress: ${state?.processedPosts || 0} / ${state?.targetPosts || 0}\n` +
            `- الكوكيز النشطة / Active: ${active}\n` +
            `- في الاستراحة / Cooldown: ${cooldown}\n` +
            `- المنتهية / Expired: ${expired}`;

          await MessengerService.sendMessage(senderId, statusMsg);
          break;
        }

        case 'addcookie': {
          const cookieName = parts[1];
          const jsonString = parts.slice(2).join(' ');

          if (!cookieName || !jsonString) {
            await MessengerService.sendMessage(senderId, 
              '❌ صيغة خاطئة / Invalid Syntax.\n' +
              'AR: /اضافة_كوكيز [الاسم] [JSON_String]\n' +
              'EN: /addcookie [Name] [JSON_String]'
            );
            return;
          }

          const parsedData = JSON.parse(jsonString);
          await Cookie.findOneAndUpdate(
            { name: cookieName },
            { data: parsedData, status: 'ACTIVE', failureReason: null },
            { upsert: true }
          );

          await MessengerService.sendMessage(senderId, `✅ تم حفظ الكوكيز [${cookieName}] بنجاح / Cookie Saved.`);
          break;
        }

        case 'listcookies': {
          const cookies = await Cookie.find().select('name status failureReason successCount');
          if (cookies.length === 0) {
            await MessengerService.sendMessage(senderId, '⚠️ لا يوجد كوكيز مسجل / No Cookies Found.');
            return;
          }

          let listMsg = '📜 قائمة الحسابات / Cookie List:\n\n';
          cookies.forEach(c => {
            listMsg += `• ${c.name}: [${c.status}] - Success: ${c.successCount}\n`;
            if (c.failureReason) listMsg += `   └ Reason: ${c.failureReason}\n`;
          });

          await MessengerService.sendMessage(senderId, listMsg);
          break;
        }

        case 'logs': {
          const state = await JobState.findOne();
          if (!state || !state.logs || state.logs.length === 0) {
            await MessengerService.sendMessage(senderId, 'ℹ️ لا توجد سجلات / No Logs Available.');
            return;
          }

          const recentLogs = state.logs.slice(-5).reverse();
          let logMsg = '📋 آخر 5 سجلات / Last 5 Logs:\n\n';
          recentLogs.forEach(l => {
            logMsg += `[${l.level}] ${new Date(l.timestamp).toLocaleTimeString()}: ${l.message}\n`;
          });

          await MessengerService.sendMessage(senderId, logMsg);
          break;
        }

        case 'help':
        default: {
          const helpMsg = `🤖 الأوامر المتاحة / Available Commands:\n\n` +
            `1️⃣ البدء / Start:\n` +
            `• /run 2000 4 𖢘[#فيلق_الهايبرا]𖢘\n` +
            `• /تشغيل 2000 4 𖢘[#فيلق_الهايبرا]𖢘\n\n` +
            `2️⃣ الإيقاف / Stop:\n` +
            `• /stop أو /ايقاف\n\n` +
            `3️⃣ الحالة / Status:\n` +
            `• /status أو /حالة\n\n` +
            `4️⃣ إضافة حساب / Add Cookie:\n` +
            `• /addcookie [Acc] [JSON]\n` +
            `• /اضافة_كوكيز [Acc] [JSON]\n\n` +
            `5️⃣ عرض الحسابات / List:\n` +
            `• /listcookies أو /الحسابات\n\n` +
            `6️⃣ السجلات / Logs:\n` +
            `• /logs أو /سجل\n\n` +
            `7️⃣ المساعدة / Help:\n` +
            `• /help أو /مساعدة`;
          await MessengerService.sendMessage(senderId, helpMsg);
          break;
        }
      }
    } catch (error) {
      console.error('❌ Command Execution Error:', error);
      await MessengerService.sendMessage(senderId, `❌ خطأ في تنفيذ الأمر / Command Error:\n${error.message}`);
    }
  }
}

module.exports = WebhookController;
