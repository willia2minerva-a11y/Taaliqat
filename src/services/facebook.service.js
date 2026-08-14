// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * تهيئة المتصفح والجلسة (يتوافق مع استدعاء fbService.init)
   */
  async init(rawCookies) {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu'
        ]
      });

      this.page = await this.browser.newPage();

      // مسح الكوكيز القديمة عبر جلسة CDP لتجنب خطأ Protocol
      const client = await this.page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');

      // معالجة وتنسيق الكوكيز
      if (rawCookies && Array.isArray(rawCookies)) {
        const formattedCookies = rawCookies.map(cookie => {
          const { sameSite, ...rest } = cookie;
          return {
            ...rest,
            domain: cookie.domain || '.facebook.com',
            url: cookie.url || 'https://www.facebook.com'
          };
        });
        await this.page.setCookie(...formattedCookies);
      }

      return true;
    } catch (error) {
      if (this.browser) await this.browser.close();
      throw new Error(`فشل تهيئة جلسة فيسبوك: ${error.message}`);
    }
  }

  /**
   * إغلاق الجلسة والمتصفح بأمان (يتوافق مع fbService.close)
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * تنفيذ كتابة التعليق على المنشور
   */
  async postComment(postUrl, commentText) {
    if (!this.page) {
      throw new Error('الجلسة غير مهيأة. يجب استدعاء init أولاً.');
    }

    try {
      await this.page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // === أضف محددات السلكتور الخاصة بالضغط على التعليق هنا ===
      // await this.page.type('textarea', commentText);
      // await this.page.click('button[type="submit"]');

      return true;
    } catch (error) {
      throw new Error(`فشل نشر التعليق: ${error.message}`);
    }
  }
}

module.exports = FacebookService;
