const config = require('../config');
const jobService = require('../services/job.service');
const messengerService = require('../services/messenger.service');
const cookieManager = require('../services/cookieManager.service');
const Post = require('../models/Post');
const JobState = require('../models/JobState');

class WebhookController {

  verifyWebhook(req, res) {
    console.log('[WEBHOOK] 🔍 Verification request');

    const mode = req.query['hub.mode'] || req.query.hub_mode;
    const token = req.query['hub.verify_token'] || req.query.hub_verify_token;
    const challenge = req.query['hub.challenge'] || req.query.hub_challenge;

    if (mode === 'subscribe' && token === config.verifyToken) {
      console.log('[WEBHOOK] ✅ VERIFIED');
      return res.status(200).send(challenge);
    }

    console.error('[WEBHOOK] ❌ Verification failed');
    return res.status(403).send('Forbidden');
  }

  async handleWebhookEvent(req, res) {
    console.log('\n[WEBHOOK] 📨 POST /webhook received');

    const body = req.body;

    console.log('[WEBHOOK] Object:', body?.object || 'NONE');
    console.log('[WEBHOOK] Entries:', Array.isArray(body?.entry) ? body.entry.length : 0);

    if (body?.object !== 'page') {
      console.warn('[WEBHOOK] ⚠️ Invalid object');
      return res.status(200).send('EVENT_RECEIVED');
    }

    // يجب الرد على Meta بسرعة وعدم انتظار Gemini/Facebook
    res.status(200).send('EVENT_RECEIVED');

    // المعالجة بعد إرسال 200
    setImmediate(async () => {
      try {
        for (const entry of body.entry || []) {
          for (const event of entry.messaging || []) {
            const senderId = event.sender?.id;

            if (!senderId) {
              console.warn('[WEBHOOK] ⚠️ Event without sender');
              continue;
            }

            console.log(`[WEBHOOK] 👤 Sender: ${senderId}`);

            if (event.message?.is_echo) {
              console.log('[WEBHOOK] ↩️ Ignoring echo');
              continue;
            }

            const text = event.message?.text?.trim();

            if (!text) {
              console.log('[WEBHOOK] ℹ️ No text message');
              continue;
            }

            console.log(`[WEBHOOK] 💬 Message: ${text}`);

            await this._processCommand(senderId, text);
          }
        }
      } catch (error) {
        console.error('[WEBHOOK] ❌ Event processing error:', error.message);
        console.error(error.stack);
      }
    });
  }

  async _send(id, text) {
    try {
      console.log(`[WEBHOOK] 📤 Replying to ${id}`);
      await messengerService.sendTextMessage(id, text);
      console.log('[WEBHOOK] ✅ Reply sent');
    } catch (error) {
      console.error('[WEBHOOK] ❌ Reply failed:', error.message);
    }
  }

  async _processCommand(senderId, text) {
    console.log(`[COMMAND] ⚙️ "${text}" from ${senderId}`);

    try {
      if (text.startsWith('/تشغيل')) {
        const parts = text.split(/\s+/);
        const count = parseInt(parts[1]) || 100;
        const hours = parseInt(parts[2]) || 1;
        const hashtag = parts.slice(3).join(' ') || '✯⁠[#عشيرة_البيجو]✯⁠';

        await jobService.startNewJob(
          count,
          config.fbGroupUrl,
          hashtag
        );

        return this._send(
          senderId,
          `🚀 تم إطلاق المهمة بنجاح!\n\n` +
          `• المنشورات: ${count}\n` +
          `• المدة: ${hours} ساعة\n` +
          `• التعليق: ${hashtag}`
        );
      }

      if (text === '/ايقاف' || text === '/stop') {
        await jobService.stopJob();

        return this._send(
          senderId,
          '🛑 تم إيقاف البوت وإلغاء المهام المعلقة.'
        );
      }

      if (text === '/حالة' || text === '/status') {
        const job = await jobService.getOrCreateJob();
        const accounts = await cookieManager.getAllCookies();

        const active = accounts.filter(x => x.status === 'ACTIVE').length;
        const blocked = accounts.filter(x => x.status === 'BLOCKED').length;
        const expired = accounts.filter(x => x.status === 'EXPIRED').length;

        return this._send(
          senderId,
          `📊 حالة النظام\n\n` +
          `• المهمة: ${job.isRunning ? '🟢 نشطة' : '🔴 متوقفة'}\n` +
          `• التقدم: ${job.completedCount || 0}/${job.totalTarget || 0}\n` +
          `• ACTIVE: ${active}\n` +
          `• BLOCKED: ${blocked}\n` +
          `• EXPIRED: ${expired}`
        );
      }

      if (text === '/التعليقات' || text === '/comments') {
        const posts = await Post.find()
          .sort({ createdAt: -1 })
          .limit(10);

        if (!posts.length) {
          return this._send(senderId, '📭 لا توجد تعليقات مسجلة.');
        }

        let msg = '💬 آخر المنشورات:\n\n';
        posts.forEach((p, i) => {
          msg += `${i + 1}. ${p.postUrl}\n`;
        });

        return this._send(senderId, msg);
      }

      if (text.startsWith('/كوكيز')) {
        const parts = text.split(/\s+/);
        const accountName = parts[1];
        const cookieString = parts.slice(2).join(' ').trim();

        if (!accountName || !cookieString) {
          return this._send(
            senderId,
            '❌ الصيغة:\n/كوكيز [اسم_الحساب] [الكوكيز]'
          );
        }

        const cookies = cookieString
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
          return this._send(
            senderId,
            '❌ لم يتم التعرف على أي Cookie.'
          );
        }

        const names = cookies.map(x => x.name);
        console.log(
          `[COOKIE INPUT] 👤 ${accountName} | COUNT=${cookies.length} | NAMES=${names.join(',')}`
        );

        await cookieManager.addCookies(
          accountName,
          cookies
        );

        return this._send(
          senderId,
          `✅ تم حفظ حساب ${accountName}\n🍪 عدد الكوكيز: ${cookies.length}\n📋 ${names.join(', ')}`
        );
      }

      if (text === '/الحسابات' || text === '/accounts') {
        const accounts = await cookieManager.getAllCookies();

        if (!accounts.length) {
          return this._send(senderId, '📭 لا توجد حسابات.');
        }

        let msg = '📜 حسابات Facebook\n\n';

        for (const account of accounts) {
          const name = account.accountName || 'UNKNOWN';
          const count = Array.isArray(account.cookies)
            ? account.cookies.length
            : 0;

          const status =
            account.status === 'ACTIVE' ? '🟢' :
            account.status === 'BLOCKED' ? '🔴' : '🟠';

          msg += `${status} ${name}\n`;
          msg += `🍪 Cookies: ${count}\n`;
          msg += `📅 آخر استخدام: ${
            account.lastUsedAt
              ? new Date(account.lastUsedAt).toLocaleString('ar-DZ')
              : 'لم يستخدم'
          }\n\n`;
        }

        return this._send(senderId, msg);
      }

      if (text === '/حذف_غير_نشط' || text === '/clean') {
        const result =
          await cookieManager.deleteInactiveAccounts();

        return this._send(
          senderId,
          `🧹 تم حذف ${result.deletedCount} حساب غير نشط.`
        );
      }

      if (text.startsWith('/حذف ')) {
        const name = text.slice(6).trim();

        if (!name) {
          return this._send(
            senderId,
            '❌ الصيغة:\n/حذف [اسم_الحساب]'
          );
        }

        const result =
          await cookieManager.deleteAccount(name);

        return this._send(
          senderId,
          result
            ? `✅ تم حذف ${name}.`
            : `❌ الحساب ${name} غير موجود.`
        );
      }

      if (text === '/سجل' || text === '/logs') {
        const job =
          await JobState.findOne({ jobId: 'main_job' });

        if (!job?.visitedPosts?.length) {
          return this._send(
            senderId,
            '📭 لا توجد سجلات.'
          );
        }

        const posts = job.visitedPosts.slice(-5);
        let msg = '📋 آخر 5 عمليات:\n\n';

        posts.forEach((p, i) => {
          msg += `${i + 1}. ${p}\n`;
        });

        return this._send(senderId, msg);
      }

      return this._send(
        senderId,
        '🤖 الأوامر:\n\n' +
        '/تشغيل [عدد] [ساعات] [التعليق]\n' +
        '/ايقاف\n' +
        '/حالة\n' +
        '/التعليقات\n' +
        '/كوكيز [الاسم] [الكوكيز]\n' +
        '/الحسابات\n' +
        '/حذف [الاسم]\n' +
        '/حذف_غير_نشط\n' +
        '/سجل'
      );

    } catch (error) {
      console.error('[COMMAND] ❌', error.message);
      console.error(error.stack);

      await this._send(
        senderId,
        `❌ حدث خطأ:\n${error.message}`
      );
    }
  }
}

module.exports = new WebhookController();
