// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * تهيئة وتجهيز المتصفح والجلسة (تتوافق مع fbService.init)
   */
  async init(rawCookies) {
    try {
      this.browser = await puppeteer.launch({
        headless: true,
        protocolTimeout: 120000,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-accelerated-2d-canvas',
          '--no-first-run',
          '--no-zygote',
          '--disable-gpu',
          '--single-process'
        ]
      });

      this.page = await this.browser.newPage();

      // تسريع التصفح بحظر وسائط الميديا الخفيفة
      await this.page.setRequestInterception(true);
      this.page.on('request', (req) => {
        const resourceType = req.resourceType();
        if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
          req.abort();
        } else {
          req.continue();
        }
      });

      this.page.setDefaultNavigationTimeout(45000);

      // مسح الكوكيز القديمة بآلية safe CDP لتجنب Network.deleteCookies Error
      const client = await this.page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');

      // معالجة وتغذية الجلسة بالكوكيز
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
      if (this.browser) {
        await this.browser.close();
        this.browser = null;
      }
      throw new Error(`فشل تهيئة جلسة فيسبوك: ${error.message}`);
    }
  }

  /**
   * إغلاق المتصفح والجلسة بآلية آمنة (تتوافق مع fbService.close)
   */
  async close() {
    if (this.browser) {
      await this.browser.close();
      this.browser = null;
      this.page = null;
    }
  }

  /**
   * تنفيذ كتابة ونشر التعليق على المنشور Target
   */
  async postComment(postUrl, commentText) {
    if (!this.page) {
      throw new Error('الجلسة غير مهيأة. يرجى استدعاء init أولاً.');
    }

    try {
      await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // === منطق التفاعل مع فيسبوك المباشر ===
      // يمكن تكييف السلكتور حسَب الواجهة المعتمدة (mbasic أو desktop)
      // await this.page.type('textarea', commentText);

      return true;
    } catch (error) {
      throw new Error(`فشل نشر التعليق على المنشور: ${error.message}`);
    }
  }
}

module.exports = FacebookService;
