const JobState = require('../models/JobState');
const Cookie = require('../models/Cookie');
const MessengerService = require('../services/messenger.service');
const { FB_VERIFY_TOKEN, ADMIN_FB_ID } = require('../config');

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

        // التحقق من صلاحية المرسل (أنت فقط)
        if (ADMIN_FB_ID && senderId !== ADMIN_FB_ID) {
          console.warn(`⚠️ محاولة أمر غير مصرح بها من ID: ${senderId}`);
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
    const parts = text.split(' ');
    const command = parts[0].toLowerCase();

    try {
      switch (command) {
        case '/run': {
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
            delayBetweenPostsMs: Math.max(delayMs, 5000), // أمان: لا يقل عن 5 ثوانٍ
            startedAt: new Date()
          }, { upsert: true });

          await MessengerService.sendMessage(senderId, 
            `🚀 تم إطلاق المهمة بنجاح!\n` +
            `- المنشورات المستهدفة: ${targetPosts}\n` +
            `- المدة: ${hours} ساعة\n` +
            `- معدل التأخير: منشور كل ${(delayMs / 1000).toFixed(1)} ثانية\n` +
            `- التعليق الجامد: ${fixedComment}`
          );
          break;
        }

        case '/stop': {
          await JobState.findOneAndUpdate({}, { isRunning: false });
          await MessengerService.sendMessage(senderId, '🛑 تم إيقاف المهمة الحالية بنجاح.');
          break;
        }

        case '/status': {
          const state = await JobState.findOne();
          const active = await Cookie.countDocuments({ status: 'ACTIVE' });
          const expired = await Cookie.countDocuments({ status: 'EXPIRED' });
          const cooldown = await Cookie.countDocuments({ status: 'COOLDOWN' });

          const statusMsg = `📊 تقرير حالة النظام:\n` +
            `- التشغيل: ${state?.isRunning ? 'نشط 🟢' : 'متوقف 🔴'}\n` +
            `- التقدم: ${state?.processedPosts || 0} / ${state?.targetPosts || 0}\n` +
            `- الكوكيز النشطة: ${active}\n` +
            `- الكوكيز الموقوفة مؤقتاً: ${cooldown}\n` +
            `- الكوكيز المنتهية: ${expired}`;

          await MessengerService.sendMessage(senderId, statusMsg);
          break;
        }

        case '/addcookie': {
          // الصيغة: /addcookie AccountName JSON_ARRAY
          const cookieName = parts[1];
          const jsonString = parts.slice(2).join(' ');

          if (!cookieName || !jsonString) {
            await MessengerService.sendMessage(senderId, '❌ الصيغة خاطئة. الاستخدام:\n/addcookie AccName [{"name":"c_user", ...}]');
            return;
          }

          const parsedData = JSON.parse(jsonString);
          await Cookie.findOneAndUpdate(
            { name: cookieName },
            { data: parsedData, status: 'ACTIVE', failureReason: null },
            { upsert: true }
          );

          await MessengerService.sendMessage(senderId, `✅ تم حفظ الكوكيز [${cookieName}] بنجاح وهو جاهز للعمل.`);
          break;
        }

        case '/listcookies': {
          const cookies = await Cookie.find().select('name status failureReason successCount');
          if (cookies.length === 0) {
            await MessengerService.sendMessage(senderId, '⚠️ لا يوجد أي كوكيز مسجل في قاعدة البيانات.');
            return;
          }

          let listMsg = '📜 قائمة الحسابات المسجلة:\n\n';
          cookies.forEach(c => {
            listMsg += `• ${c.name}: [${c.status}] - نجاح: ${c.successCount}\n`;
            if (c.failureReason) listMsg += `   └ السبب: ${c.failureReason}\n`;
          });

          await MessengerService.sendMessage(senderId, listMsg);
          break;
        }

        case '/logs': {
          const state = await JobState.findOne();
          if (!state || !state.logs || state.logs.length === 0) {
            await MessengerService.sendMessage(senderId, 'ℹ️ لا يوجد سجل أخطاء أو تنبيهات حتى الآن.');
            return;
          }

          const recentLogs = state.logs.slice(-5).reverse();
          let logMsg = '📋 آخر 5 سجلات للنظام:\n\n';
          recentLogs.forEach(l => {
            logMsg += `[${l.level}] ${new Date(l.timestamp).toLocaleTimeString('ar-EG')}: ${l.message}\n`;
          });

          await MessengerService.sendMessage(senderId, logMsg);
          break;
        }

        case '/help':
        default: {
          const helpMsg = `🤖 أوامر التحكم بالبوت:\n\n` +
            `1️⃣ /run [عدد_المنشورات] [المدة_بالساعات] [التعليق_الجامد]\n` +
            `2️⃣ /stop - إيقاف المهمة\n` +
            `3️⃣ /status - عرض حالة الإنجاز بالحسابات\n` +
            `4️⃣ /addcookie [الاسم] [JSON_String] - إضافة حساب\n` +
            `5️⃣ /listcookies - عرض كل الحسابات وحالتها\n` +
            `6️⃣ /logs - عرض الأخطاء المباشرة\n` +
            `7️⃣ /help - عرض الأوامر`;
          await MessengerService.sendMessage(senderId, helpMsg);
          break;
        }
      }
    } catch (error) {
      console.error('❌ خطأ في تنفيذ أمر المسنجر:', error);
      await MessengerService.sendMessage(senderId, `❌ حدث خطأ أثناء تنفيذ الأمر:\n${error.message}`);
    }
  }
}

module.exports = WebhookController;
