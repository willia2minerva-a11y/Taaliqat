// src/controllers/webhook.controller.js
const JobState = require('../models/JobState');
const Cookie = require('../models/Cookie');
const MessengerService = require('../services/messenger.service');
const { FB_VERIFY_TOKEN, ADMIN_FB_ID } = require('../config');

/**
 * خريطة توحيد الأوامر بالعربية والإنجليزية
 */
const COMMAND_MAP = {
  '/run': 'run', '/تشغيل': 'run', '/ابدا': 'run', '/ابدأ': 'run',
  '/stop': 'stop', '/ايقاف': 'stop', '/إيقاف': 'stop', '/توقف': 'stop',
  '/status': 'status', '/حالة': 'status', '/الحالة': 'status',
  '/addcookie': 'addcookie', '/اضافة_كوكيز': 'addcookie', '/إضافة_كوكيز': 'addcookie', '/كوكيز': 'addcookie',
  '/listcookies': 'listcookies', '/الحسابات': 'listcookies', '/عرض_الحسابات': 'listcookies',
  '/logs': 'logs', '/سجل': 'logs', '/السجلات': 'logs',
  '/delete': 'delete', '/حذف': 'delete',
  '/clean': 'clean', '/حذف_غير_نشط': 'clean',
  '/comments': 'comments', '/التعليقات': 'comments',
  '/help': 'help', '/مساعدة': 'help', '/اوامر': 'help', '/أوامر': 'help'
};

/**
 * دالة ذكية لتحليل الكوكيز سواء كانت JSON أو String عادي
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
    // الانتقال للتحليل النصي المباشر
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
  
  /**
   * دالة التحقق من الـ Webhook الخاص بفيسبوك
   */
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

  /**
   * دالة معالجة واستقبال الأحداث والرسائل الواردة
   */
  static async handleMessage(req, res) {
    const body = req.body;

    if (body.object === 'page') {
      for (const entry of body.entry) {
        if (!entry.messaging) continue;
        const webhookEvent = entry.messaging[0];
        const senderId = webhookEvent.sender.id;

        // التحقق من صلاحية المستخدم المعرف في البيئة
        if (ADMIN_FB_ID && senderId !== ADMIN_FB_ID) {
          console.warn(`⚠️ محاولة غير مصرح بها من PSID: ${senderId}`);
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

  /**
   * دالة معالجة وتنفيذ الأوامر المباشرة
   */
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
            `🚀 تم إطلاق المهمة بنجاح!\n\n` +
            `• المنشورات المستهدفة: ${targetPosts}\n` +
            `• المدة الزمنية: ${hours} ساعة\n` +
            `• نص التعليق: ${fixedComment}`
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

          const statusMsg = `📊 **حالة النظام الحالية:**\n\n` +
            `• حالة المهمة: ${state?.isRunning ? 'نشط 🟢' : 'متوقف 🔴'}\n` +
            `• نسبة الإنجاز: ${state?.processedPosts || 0} / ${state?.targetPosts || 0}\n` +
            `• الحسابات النشطة: ${active}\n` +
            `• الحسابات المعطلة: ${expired}`;

          await MessengerService.sendMessage(senderId, statusMsg);
          break;
        }

        case 'addcookie': {
          const cookieName = parts[1];
          const rawCookieData = parts.slice(2).join(' ');

          if (!cookieName || !rawCookieData) {
            await MessengerService.sendMessage(senderId, 
              '❌ الصيغة الصحيحة للإضافة:\n' +
              '/كوكيز [اسم_الحساب] [بيانات_الكوكيز]'
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

            await MessengerService.sendMessage(senderId, `✅ تم حفظ وتفعيل الحساب [${cookieName}] بنجاح.`);
          } catch (err) {
            await MessengerService.sendMessage(senderId, `❌ خطأ في معالجة الكوكيز: ${err.message}`);
          }
          break;
        }

        case 'listcookies': {
          const cookies = await Cookie.find().select('name status successCount failureReason');
          if (cookies.length === 0) {
            await MessengerService.sendMessage(senderId, '⚠️ لا توجد حسابات مسجلة في النظام حالياً.');
            return;
          }

          let listMsg = '📜 **قائمة الحسابات المسجلة:**\n\n';
          cookies.forEach(c => {
            const statusIcon = c.status === 'ACTIVE' ? '🟢' : '🔴';
            const failReason = c.status === 'EXPIRED' ? ` (السبب: ${c.failureReason || 'عطل جلسة'})` : '';
            listMsg += `${statusIcon} ${c.name} - نجاح: ${c.successCount}${failReason}\n`;
          });

          listMsg += `\n💡 لحذف حساب محدد: /حذف [اسم_الحساب]\n💡 لتنظيف الأحمر: /حذف_غير_نشط`;

          await MessengerService.sendMessage(senderId, listMsg);
          break;
        }

        case 'delete': {
          const targetName = parts[1];
          if (!targetName) {
            await MessengerService.sendMessage(senderId, '❌ يرجى تحديد اسم الحساب المراد حذفه.\nمثال: /حذف رزان');
            return;
          }

          const deleted = await Cookie.findOneAndDelete({ name: targetName });
          if (deleted) {
            await MessengerService.sendMessage(senderId, `🗑️ تم حذف الحساب [${targetName}] من قاعدة البيانات.`);
          } else {
            await MessengerService.sendMessage(senderId, `⚠️ لم يتم العثور على حساب باسم [${targetName}].`);
          }
          break;
        }

        case 'clean': {
          const result = await Cookie.deleteMany({ status: 'EXPIRED' });
          await MessengerService.sendMessage(senderId, `🧹 تم تنظيف النظام وحذف (${result.deletedCount}) حساب معطل.`);
          break;
        }

        case 'comments': {
          const state = await JobState.findOne();
          const successfulLogs = state?.logs?.filter(l => l.status === 'SUCCESS') || [];

          if (successfulLogs.length === 0) {
            await MessengerService.sendMessage(senderId, 'ℹ️ لا توجد سجلات تعليقات ناجحة حالياً.');
            return;
          }

          const lastFive = successfulLogs.slice(-5).reverse();
          let msg = '💬 **آخر التعليقات المنشورة والروابط:**\n\n';

          lastFive.forEach((l, idx) => {
            const time = new Date(l.timestamp).toLocaleTimeString('ar-EG');
            msg += `${idx + 1}. 👤 **الحساب:** ${l.cookieName}\n`;
            msg += `   📝 **التعليق:** ${l.commentText}\n`;
            msg += `   🔗 **الرابط:** ${l.postUrl}\n`;
            msg += `   ⏰ **الوقت:** ${time}\n\n`;
          });

          await MessengerService.sendMessage(senderId, msg);
          break;
        }

        case 'logs': {
          const state = await JobState.findOne();
          if (!state || !state.logs || state.logs.length === 0) {
            await MessengerService.sendMessage(senderId, 'ℹ️ لا توجد سجلات بالنظام حالياً.');
            return;
          }

          const recentLogs = state.logs.slice(-5).reverse();
          let logMsg = '📋 **آخر سجلات النظام:**\n\n';
          recentLogs.forEach(l => {
            const time = new Date(l.timestamp).toLocaleTimeString('ar-EG');
            const statusIcon = l.status === 'SUCCESS' ? '✅' : '❌';
            logMsg += `• [${time}] ${statusIcon} [${l.cookieName}] ${l.errorDetails || 'تمت العملية بنجاح'}\n`;
          });

          await MessengerService.sendMessage(senderId, logMsg);
          break;
        }

        case 'help':
        default: {
          const helpMsg = `🤖 **قائمة الأوامر الشاملة:**\n\n` +
            `▶️ /تشغيل [عدد] [ساعات] [التعليق]\n` +
            `⏹️ /ايقاف - إيقاف المهمة الحالية\n` +
            `📊 /حالة - عرض حالة المهمة\n` +
            `💬 /التعليقات - عرض روابط آخر المنشورات\n` +
            `🔑 /كوكيز [الاسم] [الكوكيز]\n` +
            `👥 /الحسابات - عرض جميع الحسابات\n` +
            `🗑️ /حذف [الاسم] - حذف حساب محدد\n` +
            `🧹 /حذف_غير_نشط - حذف الحسابات الحمراء\n` +
            `📋 /سجل - عرض السجلات الأخيرة`;

          await MessengerService.sendMessage(senderId, helpMsg);
          break;
        }
      }
    } catch (error) {
      console.error('❌ Command Processing Error:', error);
      await MessengerService.sendMessage(senderId, `❌ حدث خطأ غير متوقع: ${error.message}`);
    }
  }
}

module.exports = WebhookController;
