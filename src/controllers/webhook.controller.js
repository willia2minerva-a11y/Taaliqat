const config = require('../config');
const jobService = require('../services/job.service');
const messengerService = require('../services/messenger.service');
const cookieManager = require('../services/cookieManager.service');
const Post = require('../models/Post');
const JobState = require('../models/JobState');

class WebhookController {

  verifyWebhook(req, res) {
    console.log('\n🔐 WEBHOOK VERIFY');
    console.log('Query:', req.query);

    const mode = req.query['hub.mode'];
    const token = req.query['hub.verify_token'];
    const challenge = req.query['hub.challenge'];

    if (mode === 'subscribe' && token === config.verifyToken) {
      console.log('✅ WEBHOOK VERIFIED');
      return res.status(200).send(challenge);
    }

    console.error('❌ WEBHOOK VERIFY FAILED');
    console.error(`Expected token: ${config.verifyToken ? 'SET' : 'EMPTY'}`);
    console.error(`Received token: ${token || 'EMPTY'}`);

    return res.sendStatus(403);
  }

  async handleWebhookEvent(req, res) {
    console.log('\n📨 ===== FACEBOOK WEBHOOK RECEIVED =====');
    console.log(`⏰ ${new Date().toISOString()}`);
    console.log('IP:', req.ip);
    console.log('Object:', req.body?.object);

    // نرد فوراً على Facebook
    res.status(200).send('EVENT_RECEIVED');

    try {
      const body = req.body;

      if (!body || body.object !== 'page') {
        console.error('❌ Invalid webhook object');
        return;
      }

      if (!Array.isArray(body.entry)) {
        console.error('❌ Missing entry[]');
        return;
      }

      for (const entry of body.entry) {
        const events = Array.isArray(entry.messaging)
          ? entry.messaging
          : [];

        console.log(`📦 Entry ${entry.id || 'UNKNOWN'}: ${events.length} event(s)`);

        for (const event of events) {
          console.log(
            '📩 Event:',
            JSON.stringify(event, null, 2)
          );

          const senderId = event.sender?.id;

          if (!senderId) {
            console.log('⚠️ Event has no sender ID');
            continue;
          }

          if (event.message?.is_echo) {
            console.log('↩️ Ignoring echo message');
            continue;
          }

          const text = event.message?.text?.trim();

          if (!text) {
            console.log('ℹ️ Message has no text');
            continue;
          }

          console.log(
            `👤 Sender: ${senderId}`
          );

          console.log(
            `💬 Message: "${text}"`
          );

          // لا نجعل معالجة أمر واحد تمنع بقية الأحداث
          this._processCommand(senderId, text)
            .catch(error => {
              console.error(
                '❌ Command processing error:',
                error.message
              );
              console.error(error.stack);
            });
        }
      }

      console.log('✅ Webhook accepted successfully');

    } catch (error) {
      console.error('\n❌ WEBHOOK ERROR');
      console.error(error.message);
      console.error(error.stack);
    }
  }

  async _processCommand(senderId, text) {
    console.log(
      `⚙️ Processing command "${text}" from ${senderId}`
    );

    try {

      // ==============================
      // تشغيل
      // ==============================

      if (text.startsWith('/تشغيل')) {
        const parts = text.split(/\s+/);

        const count = parseInt(parts[1]) || 100;
        const hours = parseInt(parts[2]) || 1;

        const comment =
          parts.slice(3).join(' ') ||
          '✯⁠[#عشيرة_البيجو]✯⁠';

        await jobService.startNewJob(
          count,
          config.fbGroupUrl,
          comment
        );

        await messengerService.sendTextMessage(
          senderId,
          `🚀 تم إطلاق المهمة بنجاح!\n\n` +
          `• المنشورات: ${count}\n` +
          `• المدة: ${hours} ساعة\n` +
          `• التعليق: ${comment}`
        );

        return;
      }

      // ==============================
      // إيقاف
      // ==============================

      if (
        text === '/ايقاف' ||
        text === '/stop'
      ) {
        await jobService.stopJob();

        await messengerService.sendTextMessage(
          senderId,
          '🛑 تم إيقاف المهمة الحالية.'
        );

        return;
      }

      // ==============================
      // الحالة
      // ==============================

      if (
        text === '/حالة' ||
        text === '/status'
      ) {
        const job =
          await jobService.getOrCreateJob();

        const accounts =
          await cookieManager.getAllCookies();

        const active =
          accounts.filter(
            x => x.status === 'ACTIVE'
          ).length;

        const inactive =
          accounts.filter(
            x => x.status !== 'ACTIVE'
          ).length;

        await messengerService.sendTextMessage(
          senderId,
          `📊 حالة النظام\n\n` +
          `المهمة: ${job.isRunning ? '🟢 تعمل' : '🔴 متوقفة'}\n` +
          `التقدم: ${job.completedCount || 0}/${job.totalTarget || 0}\n` +
          `الحسابات النشطة: ${active}\n` +
          `الحسابات غير النشطة: ${inactive}\n` +
          `الانتظار: ${job.pendingPosts?.length || 0}`
        );

        return;
      }

      // ==============================
      // الحسابات
      // ==============================

      if (
        text === '/الحسابات' ||
        text === '/accounts'
      ) {
        const accounts =
          await cookieManager.getAllCookies();

        if (!accounts.length) {
          await messengerService.sendTextMessage(
            senderId,
            '📭 لا توجد حسابات.'
          );
          return;
        }

        let msg =
          '👥 حسابات Facebook\n\n';

        for (const account of accounts) {
          const name =
            account.accountName ||
            account.name ||
            'UNKNOWN';

          const status =
            account.status === 'ACTIVE'
              ? '🟢 ACTIVE'
              : '🔴 ' + (account.status || 'UNKNOWN');

          const count =
            Array.isArray(account.cookies)
              ? account.cookies.length
              : 0;

          msg +=
            `${status} | ${name}\n` +
            `🍪 Cookies: ${count}\n` +
            `📈 Success: ${account.visitedCount || 0}\n\n`;
        }

        await messengerService.sendTextMessage(
          senderId,
          msg
        );

        return;
      }

      // ==============================
      // إضافة Cookies
      // ==============================

      if (text.startsWith('/كوكيز')) {
        const parts =
          text.split(/\s+/);

        const name = parts[1];
        const cookieString =
          parts.slice(2).join(' ');

        if (!name || !cookieString) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ الصيغة:\n/كوكيز اسم_الحساب cookies'
          );
          return;
        }

        const cookies =
          cookieString
            .split(';')
            .map(x => x.trim())
            .filter(Boolean)
            .map(x => {
              const i = x.indexOf('=');

              if (i < 1) return null;

              return {
                name: x.slice(0, i).trim(),
                value: x.slice(i + 1).trim(),
                domain: '.facebook.com',
                path: '/'
              };
            })
            .filter(Boolean);

        if (!cookies.length) {
          await messengerService.sendTextMessage(
            senderId,
            '❌ لم يتم التعرف على Cookies.'
          );
          return;
        }

        await cookieManager.addCookies(
          name,
          cookies
        );

        await messengerService.sendTextMessage(
          senderId,
          `✅ تم حفظ حساب ${name}\n🍪 عدد Cookies: ${cookies.length}`
        );

        return;
      }

      // ==============================
      // حذف
      // ==============================

      if (text === '/حذف_غير_نشط' || text === '/clean') {
        const result =
          await cookieManager.deleteInactiveAccounts();

        await messengerService.sendTextMessage(
          senderId,
          `🧹 تم حذف ${result.deletedCount || 0} حساب غير نشط.`
        );

        return;
      }

      if (text.startsWith('/حذف ')) {
        const name =
          text.split(/\s+/)[1];

        const result =
          await cookieManager.deleteAccount(name);

        await messengerService.sendTextMessage(
          senderId,
          result
            ? `✅ تم حذف ${name}`
            : `❌ الحساب ${name} غير موجود`
        );

        return;
      }

      // ==============================
      // التعليقات
      // ==============================

      if (
        text === '/التعليقات' ||
        text === '/comments'
      ) {
        const posts =
          await Post.find()
            .sort({ createdAt: -1 })
            .limit(10);

        if (!posts.length) {
          await messengerService.sendTextMessage(
            senderId,
            '📭 لا توجد منشورات.'
          );
          return;
        }

        let msg =
          '💬 آخر المنشورات:\n\n';

        posts.forEach((p, i) => {
          msg += `${i + 1}. ${p.postUrl}\n`;
        });

        await messengerService.sendTextMessage(
          senderId,
          msg
        );

        return;
      }

      // ==============================
      // السجل
      // ==============================

      if (
        text === '/سجل' ||
        text === '/logs'
      ) {
        const job =
          await JobState.findOne({
            jobId: 'main_job'
          });

        const posts =
          job?.visitedPosts || [];

        if (!posts.length) {
          await messengerService.sendTextMessage(
            senderId,
            '📭 لا يوجد سجل.'
          );
          return;
        }

        const last =
          posts.slice(-5);

        await messengerService.sendTextMessage(
          senderId,
          `📋 آخر العمليات:\n\n${last.join('\n')}`
        );

        return;
      }

      // ==============================
      // مساعدة
      // ==============================

      await messengerService.sendTextMessage(
        senderId,
        `🤖 أوامر البوت:\n\n` +
        `/تشغيل [عدد] [ساعات] [التعليق]\n` +
        `/ايقاف\n` +
        `/حالة\n` +
        `/الحسابات\n` +
        `/كوكيز [الاسم] [cookies]\n` +
        `/حذف [الاسم]\n` +
        `/حذف_غير_نشط\n` +
        `/التعليقات\n` +
        `/سجل`
      );

    } catch (error) {
      console.error(
        `❌ COMMAND ERROR: ${error.message}`
      );
      console.error(error.stack);

      try {
        await messengerService.sendTextMessage(
          senderId,
          `❌ خطأ أثناء تنفيذ الأمر:\n${error.message}`
        );
      } catch (sendError) {
        console.error(
          `❌ Reply failed: ${sendError.message}`
        );
      }
    }
  }
}

module.exports =
  new WebhookController();
