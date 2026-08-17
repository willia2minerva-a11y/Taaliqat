// src/controllers/webhook.controller.js
const config = require('../config');
const jobService = require('../services/job.service');
const messengerService = require('../services/messenger.service');
const cookieManagerService = require('../services/cookieManager.service');
const Cookie = require('../models/Cookie');
const Post = require('../models/Post');
const JobState = require('../models/JobState');

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
      // =========================================================
      // 📌 RUN JOB
      // =========================================================
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

      // =========================================================
      // ⏹️ STOP JOB
      // =========================================================
      else if (text === '/ايقاف' || text === '/stop') {
        await jobService.stopJob();
        await messengerService.sendTextMessage(
          senderId,
          '🛑 تم إيقاف البوت وإلغاء جميع المهام المعلقة.'
        );
      }

      // =========================================================
      // 📊 STATUS
      // =========================================================
      else if (text === '/حالة' || text === '/status') {
        const job = await jobService.getOrCreateJob();
        const status = job.isRunning ? '🟢 نشط' : '🔴 متوقف';
        const progress = job.totalTarget > 0 ? `${job.completedCount} / ${job.totalTarget}` : '0 / 0';

        const allCookies = await cookieManagerService.getAllCookies();
        const activeCount = allCookies.filter(c => c.status === 'ACTIVE').length;
        const blockedCount = allCookies.filter(c => c.status === 'BLOCKED').length;

        let pagesCount = 0;
        for (const account of allCookies) {
          if (account.pages) {
            pagesCount += account.pages.filter(p => p.status === 'ACTIVE').length;
          }
        }

        await messengerService.sendTextMessage(
          senderId,
          `📊 **حالة النظام الحالية:**\n\n` +
          `• حالة المهمة: ${status}\n` +
          `• نسبة الإنجاز: ${progress}\n` +
          `• الحسابات النشطة: ${activeCount}\n` +
          `• الحسابات المعطلة: ${blockedCount}\n` +
          `• الصفحات النشطة: ${pagesCount}`
        );
      }

      // =========================================================
      // 💬 SHOW COMMENTS
      // =========================================================
      else if (text === '/التعليقات' || text === '/comments') {
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

      // =========================================================
      // 🔑 ADD COOKIES (الإصدار النهائي مع تشخيص كامل)
      // =========================================================
      else if (text.startsWith('/كوكيز')) {
        // ✅ استخدام regex لاستخراج اسم الحساب وجميع الكوكيز
        const match = text.match(/^\/كوكيز\s+(\S+)\s+([\s\S]+)$/);

        if (!match) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة الصحيحة:\n/كوكيز [اسم_الحساب] [الكوكيز]\n\n' +
            'مثال:\n' +
            '/كوكيز ايتاشي datr=xxx;c_user=xxx;xs=xxx;fr=xxx'
          );
          return;
        }

        const accountName = match[1].trim();
        const cookieString = match[2].trim();

        if (!accountName || !cookieString) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة الصحيحة:\n/كوكيز [اسم_الحساب] [الكوكيز]'
          );
          return;
        }

        // ✅ طباعة للتصحيح في Logs
        console.log('\n════════════════════════════════════════════');
        console.log('🍪 COOKIE COMMAND DEBUG');
        console.log('════════════════════════════════════════════');
        console.log('👤 Account:', accountName);
        console.log('📏 Cookie string length:', cookieString.length);
        console.log('🔎 Cookie string preview:', cookieString.substring(0, 150) + '...');
        console.log('🔢 Cookie count in string:', cookieString.split(';').length);
        console.log('🏷️ Cookie names in string:', cookieString.split(';').map(x => {
          const idx = x.indexOf('=');
          return idx > 0 ? x.substring(0, idx).trim() : x.trim();
        }).join(', '));
        console.log('════════════════════════════════════════════\n');

        try {
          const result = await cookieManagerService.addCookies(accountName, cookieString);

          const cookieCount = result.cookies?.length || 0;
          await messengerService.sendTextMessage(
            senderId,
            `✅ تم إضافة حساب **${accountName}** بنجاح!\n` +
            `📊 عدد الكوكيز: ${cookieCount}\n` +
            `🔍 الكوكيز: ${result.cookies?.map(c => c.name).join(', ') || 'لا يوجد'}`
          );
        } catch (error) {
          console.error(`❌ Add cookies error: ${error.message}`);
          await messengerService.sendTextMessage(
            senderId,
            `❌ فشل إضافة الكوكيز: ${error.message}`
          );
        }
      }

      // =========================================================
      // 👥 SHOW ACCOUNTS
      // =========================================================
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
        for (const cookie of allCookies) {
          const status = cookie.status === 'ACTIVE' ? '🟢' : '🔴';
          const pagesCount = cookie.pages?.filter(p => p.status === 'ACTIVE').length || 0;
          message += `${status} ${cookie.accountName} - صفحات: ${pagesCount}\n`;
        }

        message += '\n💡 لحذف حساب محدد: /حذف [اسم_الحساب]\n';
        message += '💡 لتنظيف الأحمر: /حذف_غير_نشط';

        await messengerService.sendTextMessage(senderId, message);
      }

      // =========================================================
      // 🗑️ DELETE ACCOUNT
      // =========================================================
      else if (text.startsWith('/حذف') && !text.startsWith('/حذف_غير_نشط') && !text.startsWith('/حذف_صفحة')) {
        const parts = text.split(' ');
        const accountName = parts[1];

        if (!accountName) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة الصحيحة:\n/حذف [اسم_الحساب]'
          );
          return;
        }

        const result = await cookieManagerService.deleteAccount(accountName);
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

      // =========================================================
      // 🧹 DELETE INACTIVE ACCOUNTS
      // =========================================================
      else if (text === '/حذف_غير_نشط' || text === '/clean') {
        const result = await cookieManagerService.deleteInactiveAccounts();
        await messengerService.sendTextMessage(
          senderId,
          `🧹 تم حذف **${result.deletedCount}** حساب غير نشط.`
        );
      }

      // =========================================================
      // 📄 ADD PAGE TO ACCOUNT
      // =========================================================
      else if (text.startsWith('/اضافة_صفحة')) {
        const parts = text.split(' ');
        const accountName = parts[1];
        const pageId = parts[2];
        const pageName = parts.slice(3).join(' ') || pageId;

        if (!accountName || !pageId) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة الصحيحة:\n/اضافة_صفحة [اسم_الحساب] [معرف_الصفحة] [اسم_الصفحة]'
          );
          return;
        }

        try {
          await cookieManagerService.addPageToAccount(accountName, pageId, pageName);
          await messengerService.sendTextMessage(
            senderId,
            `✅ تم إضافة صفحة **${pageName}** (${pageId}) إلى حساب **${accountName}**`
          );
        } catch (error) {
          await messengerService.sendTextMessage(
            senderId,
            `❌ فشل إضافة الصفحة: ${error.message}`
          );
        }
      }

      // =========================================================
      // 📄 SHOW ACCOUNT PAGES
      // =========================================================
      else if (text.startsWith('/صفحات')) {
        const parts = text.split(' ');
        const accountName = parts[1];

        if (!accountName) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة الصحيحة:\n/صفحات [اسم_الحساب]'
          );
          return;
        }

        const pages = await cookieManagerService.getAccountPages(accountName);
        if (!pages || pages.length === 0) {
          await messengerService.sendTextMessage(
            senderId,
            `📭 لا توجد صفحات مسجلة لحساب **${accountName}**`
          );
          return;
        }

        let message = `📄 **صفحات حساب ${accountName}:**\n\n`;
        pages.forEach((page, index) => {
          const status = page.status === 'ACTIVE' ? '🟢' : '🔴';
          message += `${index + 1}. ${status} ${page.pageName} (${page.pageId})\n`;
          message += `   💬 تعليقات: ${page.commentsCount || 0}\n`;
          if (page.lastError) {
            message += `   ⚠️ آخر خطأ: ${page.lastError}\n`;
          }
        });

        await messengerService.sendTextMessage(senderId, message);
      }

      // =========================================================
      // 🗑️ DELETE PAGE
      // =========================================================
      else if (text.startsWith('/حذف_صفحة')) {
        const parts = text.split(' ');
        const accountName = parts[1];
        const pageId = parts[2];

        if (!accountName || !pageId) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة الصحيحة:\n/حذف_صفحة [اسم_الحساب] [معرف_الصفحة]'
          );
          return;
        }

        try {
          await cookieManagerService.deletePage(accountName, pageId);
          await messengerService.sendTextMessage(
            senderId,
            `✅ تم حذف الصفحة ${pageId} من حساب **${accountName}**`
          );
        } catch (error) {
          await messengerService.sendTextMessage(
            senderId,
            `❌ فشل حذف الصفحة: ${error.message}`
          );
        }
      }

      // =========================================================
      // 📝 SHOW ERRORS
      // =========================================================
      else if (text === '/اخطاء' || text === '/errors') {
        const allCookies = await cookieManagerService.getAllCookies();
        let message = '⚠️ **الأخطاء المسجلة:**\n\n';
        let hasErrors = false;

        for (const account of allCookies) {
          // أخطاء الحسابات الشخصية
          if (account.lastError) {
            hasErrors = true;
            message += `👤 **${account.accountName}**\n`;
            message += `❌ ${account.lastError}\n`;
            message += `🕐 ${account.lastErrorTime ? new Date(account.lastErrorTime).toLocaleString() : 'غير محدد'}\n\n`;
          }

          // أخطاء الصفحات
          if (account.pages && account.pages.length > 0) {
            for (const page of account.pages) {
              if (page.lastError) {
                hasErrors = true;
                message += `📄 **${page.pageName}** (تابع لـ ${account.accountName})\n`;
                message += `❌ ${page.lastError}\n`;
                message += `🕐 ${page.lastErrorTime ? new Date(page.lastErrorTime).toLocaleString() : 'غير محدد'}\n\n`;
              }
            }
          }
        }

        if (!hasErrors) {
          message += '✅ لا توجد أخطاء مسجلة.';
        }

        await messengerService.sendTextMessage(senderId, message);
      }

      // =========================================================
      // 🔄 CLEAR ERRORS
      // =========================================================
      else if (text === '/مسح_الاخطاء' || text === '/clear_errors') {
        let cleared = 0;

        const allCookies = await cookieManagerService.getAllCookies();
        for (const account of allCookies) {
          if (account.lastError) {
            await Cookie.findByIdAndUpdate(account._id, {
              $unset: { lastError: 1, lastErrorTime: 1 }
            });
            cleared++;
          }

          if (account.pages && account.pages.length > 0) {
            for (const page of account.pages) {
              if (page.lastError) {
                await Cookie.findOneAndUpdate(
                  { _id: account._id, 'pages.pageId': page.pageId },
                  { $unset: { 'pages.$.lastError': 1, 'pages.$.lastErrorTime': 1 } }
                );
                cleared++;
              }
            }
          }
        }

        await messengerService.sendTextMessage(
          senderId,
          `🧹 تم مسح **${cleared}** خطأ مسجل.`
        );
      }

      // =========================================================
      // 📋 SHOW LOGS
      // =========================================================
      else if (text === '/سجل' || text === '/logs') {
        const job = await JobState.findOne({ jobId: 'main_job' });

        if (!job || job.visitedPosts.length === 0) {
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

      // =========================================================
      // ❓ HELP
      // =========================================================
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
          '📋 /سجل - عرض السجلات الأخيرة\n\n' +
          '📄 **أوامر الصفحات:**\n' +
          '📄 /اضافة_صفحة [الحساب] [معرف_الصفحة] [اسم_الصفحة]\n' +
          '📄 /صفحات [اسم_الحساب] - عرض صفحات حساب\n' +
          '🗑️ /حذف_صفحة [الحساب] [معرف_الصفحة]\n\n' +
          '⚠️ **أوامر الأخطاء:**\n' +
          '📝 /اخطاء - عرض جميع الأخطاء المسجلة\n' +
          '🧹 /مسح_الاخطاء - مسح جميع الأخطاء المسجلة'
        );
      }

    } catch (error) {
      console.error(`❌ Command error: ${error.message}`);
      console.error(`📚 Stack: ${error.stack}`);
      await messengerService.sendTextMessage(
        senderId,
        `❌ حدث خطأ: ${error.message}`
      );
    }
  }
}

module.exports = new WebhookController();
