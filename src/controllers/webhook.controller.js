// src/controllers/webhook.controller.js
const JobState = require('../models/JobState');
const Cookie = require('../models/Cookie');
const MessengerService = require('../services/messenger.service');
const { FB_VERIFY_TOKEN, ADMIN_FB_ID } = require('../config');

const COMMAND_MAP = {
  '/run': 'run', '/تشغيل': 'run',
  '/stop': 'stop', '/ايقاف': 'stop',
  '/status': 'status', '/حالة': 'status',
  '/addcookie': 'addcookie', '/كوكيز': 'addcookie',
  '/listcookies': 'listcookies', '/الحسابات': 'listcookies',
  '/logs': 'logs', '/سجل': 'logs',
  '/delete': 'delete', '/حذف': 'delete',
  '/clean': 'clean', '/حذف_غير_نشط': 'clean',
  '/comments': 'comments', '/التعليقات': 'comments',
  '/help': 'help', '/مساعدة': 'help'
};

class WebhookController {
  // ... verifyWebhook و handleMessage كما هي ...

  static async processCommand(senderId, text) {
    const parts = text.split(/\s+/);
    const rawCommand = parts[0].toLowerCase();
    const command = COMMAND_MAP[rawCommand] || rawCommand;

    try {
      switch (command) {
        
        // 🗑️ 1. أمر حذف حساب معين
        case 'delete': {
          const targetName = parts[1];
          if (!targetName) {
            await MessengerService.sendMessage(senderId, '❌ يرجى تحديد اسم الحساب.\nمثال: /حذف رزان');
            return;
          }

          const deleted = await Cookie.findOneAndDelete({ name: targetName });
          if (deleted) {
            await MessengerService.sendMessage(senderId, `🗑️ تم حذف الحساب [${targetName}] بنجاح.`);
          } else {
            await MessengerService.sendMessage(senderId, `⚠️ لم يتم العثور على حساب باسم [${targetName}].`);
          }
          break;
        }

        // 🧹 2. أمر تنظيف وحذف جميع الحسابات المتوقفة/الحمراء دفعة واحدة
        case 'clean': {
          const result = await Cookie.deleteMany({ status: 'EXPIRED' });
          await MessengerService.sendMessage(senderId, `🧹 تم تنظيف النظام وحذف (${result.deletedCount}) حساب غير نشط.`);
          break;
        }

        // 🔗 3. أمر عرض آخر التعليقات مع الروابط والتأكد منها
        case 'comments': {
          const state = await JobState.findOne();
          const successfulLogs = state?.logs?.filter(l => l.status === 'SUCCESS') || [];

          if (successfulLogs.length === 0) {
            await MessengerService.sendMessage(senderId, 'ℹ️ لا توجد تعليقات مسجلة حديثاً.');
            return;
          }

          const lastFive = successfulLogs.slice(-5).reverse();
          let msg = '💬 **آخر التعليقات الناجحة والروابط:**\n\n';

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

        // 👥 قائمة الحسابات المحدثة
        case 'listcookies': {
          const cookies = await Cookie.find().select('name status successCount failureReason');
          if (cookies.length === 0) {
            await MessengerService.sendMessage(senderId, '⚠️ لا توجد حسابات مسجلة.');
            return;
          }

          let listMsg = '📜 **قائمة الحسابات:**\n\n';
          cookies.forEach(c => {
            const statusIcon = c.status === 'ACTIVE' ? '🟢' : '🔴';
            const failInfo = c.status === 'EXPIRED' ? ` (سبب العطل: ${c.failureReason || 'غير معروف'})` : '';
            listMsg += `${statusIcon} ${c.name} - نجاح: ${c.successCount}${failInfo}\n`;
          });

          listMsg += `\n💡 لحذف حساب: /حذف [الاسم]\n💡 لتنظيف الأحمر: /حذف_غير_نشط`;

          await MessengerService.sendMessage(senderId, listMsg);
          break;
        }

        // 🤖 قائمة المساعدة الشاملة
        case 'help':
        default: {
          const helpMsg = `🤖 **قائمة الأوامر المحدثة:**\n\n` +
            `▶️ /تشغيل [عدد] [ساعات] [التعليق]\n` +
            `⏹️ /ايقاف\n` +
            `📊 /حالة - عرض حالة المهمة\n` +
            `💬 /التعليقات - عرض روابط آخر التعليقات\n` +
            `🔑 /كوكيز [الاسم] [الكوكيز]\n` +
            `👥 /الحسابات - عرض جميع الحسابات\n` +
            `🗑️ /حذف [الاسم] - حذف حساب محدد\n` +
            `🧹 /حذف_غير_نشط - تنظيف الحسابات الحمراء`;

          await MessengerService.sendMessage(senderId, helpMsg);
          break;
        }
      }
    } catch (error) {
      console.error('❌ Command Error:', error);
      await MessengerService.sendMessage(senderId, `❌ خطأ في تنفيذ الأمر: ${error.message}`);
    }
  }
}

module.exports = WebhookController;
