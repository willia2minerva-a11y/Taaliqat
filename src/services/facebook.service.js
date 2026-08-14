// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.browser = null;
  }

  /**
   * جلب أو إنشاء جلسة متصفح عامة (Singleton Pattern) لتوفير الذاكرة والـ CPU
   */
  async getBrowser() {
    if (this.browser && this.browser.isConnected()) {
      return this.browser;
    }

    this.browser = await puppeteer.launch({
      headless: true,
      protocolTimeout: 120000, // زيادة مهلة البروتوكول إلى دقيقتين
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process' // لتقليل استهلاك الذاكرة على Render
      ]
    });

    return this.browser;
  }

  /**
   * تنفيذ كتابة التعليق بآلية فائقة السرعة مع منع الميديا والـ Timeouts
   */
  async postComment(rawCookies, postUrl, commentText) {
    let page = null;
    try {
      const browser = await this.getBrowser();
      page = await browser.newPage();

      // 1. تسريع التحميل الخرافي: حظر الصور، الصوت، والأنيميشن
      await page.setRequestInterception(true);
      page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      // 2. تعيين المهلة المخصصة للصفحة
      page.setDefaultNavigationTimeout(45000);

      // 3. مسح وتجهيز الكوكيز
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');

      if (rawCookies && Array.isArray(rawCookies)) {
        const formattedCookies = rawCookies.map(cookie => {
          const { sameSite, ...rest } = cookie;
          return {
            ...rest,
            domain: cookie.domain || '.facebook.com',
            url: cookie.url || 'https://www.facebook.com'
          };
        });
        await page.setCookie(...formattedCookies);
      }

      // 4. التوجه للمنشور بصيغة domcontentloaded لتجنب انتظار الصور والإعلانات
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // === أضف منطق الضغط والتعليق المباشر هنا ===
      // await page.type('textarea', commentText);

      return true;
    } catch (error) {
      throw error;
    } finally {
      // إغلاق التبويب فقط وإبقاء المتصفح يعمل للمهمة القادمة
      if (page) await page.close();
    }
  }

  /**
   * إغلاق المتصفح عند إيقاف السيرفر
   */
  async closeBrowser() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
    }
  }
}

// تصدير Singleton Instance
module.exports = new FacebookService();
