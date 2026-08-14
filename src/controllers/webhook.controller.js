// src/controllers/webhook.controller.js
const JobState = require('../models/JobState');
const Cookie = require('../models/Cookie');
const MessengerService = require('../services/messenger.service');
const { FB_VERIFY_TOKEN, ADMIN_FB_ID } = require('../config');

/**
 * خريطة توحيد الأوامر (Command Map)
 * تربط المرادفات بالعربية والإنجليزية بمفتاح موحد لتسهيل المعالجة.
 */
const COMMAND_MAP = {
  '/run': 'run',
  '/تشغيل': 'run',
  '/ابدا': 'run',
  '/ابدأ': 'run',

  '/stop': 'stop',
  '/ايقاف': 'stop',
  '/إيقاف': 'stop',
  '/توقف': 'stop',

  '/status': 'status',
  '/حالة': 'status',
  '/الحالة': 'status',

  '/addcookie': 'addcookie',
  '/اضافة_كوكيز': 'addcookie',
  '/إضافة_كوكيز': 'addcookie',
  '/كوكيز': 'addcookie',

  '/listcookies': 'listcookies',
  '/الحسابات': 'listcookies',
  '/عرض_الحسابات': 'listcookies',

  '/logs': 'logs',
  '/سجل': 'logs',
  '/السجلات': 'logs',

  '/help': 'help',
  '/مساعدة': 'help',
  '/اوامر': 'help',
  '/أوامر': 'help'
};

/**
 * دالة تحليل الكوكيز الذكية
 * تدعم صيغة JSON والمحتوى النصي العادي (Header String) تلقائياً.
 */
function parseCookieInput(rawInput) {
  const trimmed = rawInput.trim();
  
  // 1. المحاولة الأولى: التحليل كـ JSON
  try {
    const parsed = JSON.parse(trimmed);
    if (Array.isArray(parsed) || typeof parsed === 'object') {
      return parsed;
    }
  } catch (e) {
    // الانتقال للتحليل النصي في حال عدم تطابق صياغة JSON
  }

  // 2. المحاولة الثانية: التحليل كنص عادي (datr=xxx; sb=yyy)
  const cookiePairs = trimmed.split(';').map(p => p.trim()).filter(Boolean);
  const cookieArray = [];

  for (const pair of cookiePairs) {
    const equalIdx = pair.indexOf('=');
    if (equalIdx !== -1) {
      const name = pair.substring(0, equalIdx).trim();
      const value = pair.substring(equalIdx + 1).trim();
      if (name && value) {
        cookieArray.push({ name, value });
      }
    }
  }

  if (cookieArray.length === 0) {
    throw new Error('صيغة الكوكيز غير صالحة. تأكد من نسخ النص بشكل صحيح.');
  }

  return cookieArray;
}

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
    
    const command = COMMAND_MAP[rawCommand] || rawCommand;

    try {
      switch (command) {
        case 'run': {
          const targetPosts = parseInt(parts[1], 10) || 100;
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
            `🚀 تم إطلاق المهمة!\n\n` +
            `• المنشورات: ${targetPosts}\n` +
            `• المدة: ${hours} ساعة\n` +
            `• التعليق: ${fixedComment}`
          );
          break;
        }

        case 'stop': {
          await JobState.findOneAndUpdate({}, { isRunning: false });
          await MessengerService.sendMessage(senderId, '🛑 تم إيقاف المهمة بنجاح.');
          break;
        }

        case 'status': {
          const state = await JobState.findOne();
          const active = await Cookie.countDocuments({ status: 'ACTIVE' });
          const expired = await Cookie.countDocuments({ status: 'EXPIRED' });

          const statusMsg = `📊 حالة النظام:\n\n` +
            `• الحالة: ${state?.isRunning ? 'نشط 🟢' : 'متوقف 🔴'}\n` +
            `• الإنجاز: ${state?.processedPosts || 0} / ${state?.targetPosts || 0}\n` +
            `• الحسابات النشطة: ${active}\n` +
            `• الحسابات المنتهية: ${expired}`;

          await MessengerService.sendMessage(senderId, statusMsg);
          break;
        }

        case 'addcookie': {
          const cookieName = parts[1];
          const rawCookieData = parts.slice(2).join(' ');

          if (!cookieName || !rawCookieData) {
            await MessengerService.sendMessage(senderId, 
              '❌ الصيغة الصحيحة:\n' +
              '/اضافة_كوكيز [اسم_الحساب] [بيانات_الكوكيز]'
            );
            return;
          }

          try {
            const parsedData = parseCookieInput(rawCookieData);

            await Cookie.findOneAndUpdate(
              { name: cookieName },
              { data: parsedData, status: 'ACTIVE', failureReason: null },
              { upsert: true }
            );

            await MessengerService.sendMessage(senderId, `✅ تم حفظ الحساب [${cookieName}] بنجاح.`);
          } catch (err) {
            await MessengerService.sendMessage(senderId, `❌ خطأ في الكوكيز: ${err.message}`);
          }
          break;
        }

        case 'listcookies': {
          const cookies = await Cookie.find().select('name status successCount');
          if (cookies.length === 0) {
            await MessengerService.sendMessage(senderId, '⚠️ لا توجد حسابات مسجلة حالياً.');
            return;
          }

          let listMsg = '📜 قائمة الحسابات:\n\n';
          cookies.forEach(c => {
            const statusIcon = c.status === 'ACTIVE' ? '🟢' : '🔴';
            listMsg += `${statusIcon} ${c.name} - نجاح: ${c.successCount}\n`;
          });

          await MessengerService.sendMessage(senderId, listMsg);
          break;
        }

        case 'logs': {
          const state = await JobState.findOne();
          if (!state || !state.logs || state.logs.length === 0) {
            await MessengerService.sendMessage(senderId, 'ℹ️ لا توجد سجلات حالياً.');
            return;
          }

          const recentLogs = state.logs.slice(-5).reverse();
          let logMsg = '📋 آخر السجلات:\n\n';
          recentLogs.forEach(l => {
            logMsg += `• [${new Date(l.timestamp).toLocaleTimeString()}] ${l.message}\n`;
          });

          await MessengerService.sendMessage(senderId, logMsg);
          break;
        }

        case 'help':
        default: {
          const helpMsg = `🤖 قائمة الأوامر المبسطة:\n\n` +
            `▶️ التشغيل:\n` +
            `• /تشغيل [عدد_المنشورات] [الساعات] [التعليق]\n` +
            `مثال: /تشغيل 100 2 سلام عليكم\n\n` +
            `⏹️ الإيقاف:\n` +
            `• /ايقاف\n\n` +
            `📊 الحالة:\n` +
            `• /حالة\n\n` +
            `🔑 إضافة كوكيز:\n` +
            `• /كوكيز [اسم_الحساب] [الكوكيز]\n\n` +
            `👥 الحسابات:\n` +
            `• /الحسابات\n\n` +
            `📋 السجلات:\n` +
            `• /سجل`;

          await MessengerService.sendMessage(senderId, helpMsg);
          break;
        }
      }
    } catch (error) {
      console.error('❌ Command Execution Error:', error);
      await MessengerService.sendMessage(senderId, `❌ حدث خطأ أثناء تنفيذ الأمر: ${error.message}`);
    }
  }
}

module.exports = WebhookController;

