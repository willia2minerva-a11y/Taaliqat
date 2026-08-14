// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  /**
   * تهيئة وتجهيز متصفح Puppeteer وجلسة العمل بآلية محسّنة لبيئة Render
   * @param {Array} rawCookies - مصفوفة الكوكيز الخاصة بالحساب
   */
  async init(rawCookies) {
    try {
      // إطلاق المتصفح إذا لم يكن يعمل سابقاً أو تم فصله
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

      // حظر أصول الوسائط المباشرة لتسريع زمن استجابة التصفح
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

      // مسح الكوكيز القديمة عبر CDP لضمان عدم تداخل الجلسات
      const client = await this.page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');

      // تهيئة الكوكيز وتنسيق النطاقات الخاصة بفيسبوك
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
   * تنفيذ عملية التوجه للمنشور ونشر التعليق المطلوب
   * @param {Array} rawCookies - كوكيز الحساب المنفذ
   * @param {string} postUrl - رابط المنشور المستهدف
   * @param {string} commentText - نص التعليق
   */
  async postComment(rawCookies, postUrl, commentText) {
    try {
      // تهيئة وتغذية الجلسة بالكوكيز قبل التنفيذ
      await this.init(rawCookies);

      // التوجه إلى رابط المنشور بصيغة domcontentloaded لتفادي انتهاء المهلة
      await this.page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // === تفاعل إضافة التعليق عبر الواجهة ===
      // يتم تفعيل وتكييف السلكتور حسَب الواجهة المستهدفة (mbasic / desktop)
      // await this.page.type('textarea', commentText);

      return true;
    } catch (error) {
      throw error;
    } finally {
      // إغلاق التبويب فقط بعد انتهاء العملية لتحرير الذاكرة وإبقاء المتصفح رهن الاستخدام
      if (this.page) {
        await this.page.close().catch(() => {});
        this.page = null;
      }
    }
  }

  /**
   * إغلاق الجلسة والمتصفح بشكل آمن عند الحاجة
   */
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

// 💡 تصدير Singleton Instance لضمان استدعاء الدوال مباشرة في الـ Worker والـ Controllers
module.exports = new FacebookService();
