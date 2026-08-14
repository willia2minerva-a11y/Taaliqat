// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * تهيئة المتصفح والجلسة بآلية خفيفة ومناسبة لبيئة Render
   */
  async init(rawCookies) {
    try {
      if (!this.browser || !this.browser.isConnected()) {
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
      }

      this.page = await this.browser.newPage();

      // حظر الصور والوسائط لتسريع الأداء
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

      // مسح الكوكيز القديمة وتغذية الجلسة بالكوكيز الجديدة
      const client = await this.page.target().createCDPSession();
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
        await this.page.setCookie(...formattedCookies);
      }

      return true;
    } catch (error) {
      await this.close();
      throw new Error(`فشل تهيئة جلسة فيسبوك: ${error.message}`);
    }
  }

  /**
   * تنفيذ وتأكيد النشر الفعلي على المنشور واستخراج الرابط المباشر
   */
  async postComment(rawCookies, targetUrl, commentText) {
    try {
      await this.init(rawCookies);

      // 1. الانتقال إلى الصفحة المطلوبة
      await this.page.goto(targetUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // 2. التحقق من وجود حقل الإدخال على mbasic.facebook.com
      const textareaSelector = 'textarea[name="comment_text"], textarea';
      await this.page.waitForSelector(textareaSelector, { timeout: 15000 });

      // 3. كتابة التعليق
      await this.page.type(textareaSelector, commentText, { delay: 50 });

      // 4. البحث عن زر النشر واختياره
      const submitSelector = 'input[type="submit"][name="post"], input[type="submit"]';
      
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        this.page.click(submitSelector)
      ]);

      // 5. استخراج رابط الصفحة الحقيقي بعد التوجيه المباشر للمنشور/التعليق
      const actualPostUrl = this.page.url();

      return {
        success: true,
        actualUrl: actualPostUrl
      };

    } catch (error) {
      throw new Error(`فشل تنفيذ التعليق الفعلي: ${error.message}`);
    } finally {
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
    }
  }

  async close() {
    if (this.page) {
      await this.page.close().catch(() => {});
      this.page = null;
    }
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

module.exports = new FacebookService();

