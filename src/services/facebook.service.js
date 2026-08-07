const puppeteer = require('puppeteer');
const { FB_GROUP_URL } = require('../config');

class FacebookService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async init(cookieData) {
    this.browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--disable-gpu'
      ]
    });
    this.page = await this.browser.newPage();
    
    // ضبط العرض والارتفاع لمنع اكتشاف الأتمتة
    await this.page.setViewport({ width: 1280, height: 800 });

    if (cookieData && Array.isArray(cookieData)) {
      await this.page.setCookie(...cookieData);
    } else {
      throw new Error('بيانات الكوكيز المقدمة غير صالحة.');
    }
  }

  async goToGroup() {
    await this.page.goto(FB_GROUP_URL, { waitUntil: 'networkidle2', timeout: 60000 });
    
    // الفحص عن ما إذا كان الحساب قد سجل خروجه
    const isLoginPage = await this.page.evaluate(() => {
      return document.querySelector('input[id="email"]') !== null || document.title.includes('Log in');
    });

    if (isLoginPage) {
      throw new Error('SESSION_EXPIRED: الكوكيز منتهي الصلاحية وحساب فيسبوك يتطلب تسجيل الدخول.');
    }
  }

  async extractFeedPosts() {
    // استخراج المنشورات الموجودة في الصفحة الحالية
    return await this.page.evaluate(() => {
      const articles = Array.from(document.querySelectorAll('div[role="article"]'));
      return articles.map((art, index) => {
        const text = art.innerText || '';
        return { index, textSnippet: text.substring(0, 150) };
      }).filter(p => p.textSnippet.length > 15);
    });
  }

  async postComments(postIndex, aiComment, fixedComment) {
    try {
      const articles = await this.page.$$('div[role="article"]');
      if (!articles[postIndex]) return false;

      const postElement = articles[postIndex];

      // البحث عن مربع التعليق
      const commentBoxSelector = 'div[aria-label="Write a comment"], div[aria-label="كتابة تعليق"]';
      await postElement.waitForSelector(commentBoxSelector, { timeout: 5000 });
      const commentBox = await postElement.$(commentBoxSelector);

      if (!commentBox) return false;

      // 1. التعليق الأول (AI)
      await commentBox.click();
      await this.randomDelay(1000, 2000);
      await this.page.keyboard.type(aiComment, { delay: 40 });
      await this.page.keyboard.press('Enter');

      await this.randomDelay(3000, 5000);

      // 2. التعليق الثاني (الجامد)
      await commentBox.click();
      await this.randomDelay(1000, 2000);
      await this.page.keyboard.type(fixedComment, { delay: 40 });
      await this.page.keyboard.press('Enter');

      return true;
    } catch (err) {
      throw new Error(`خطأ أثناء إضافة التعليقات: ${err.message}`);
    }
  }

  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
    }
  }
}

module.exports = FacebookService;
