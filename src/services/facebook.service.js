// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

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
   * جلب منشور جديد غير معلق عليه سابقاً واستخراج نصه ورابطه المباشر
   */
  async fetchNextPost(rawCookies, groupUrl, visitedPosts = []) {
    try {
      await this.init(rawCookies);
      await this.page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 45000 });

      // البحث عن روابط المنشورات في الواجهة
      const postLinks = await this.page.$$eval('a', anchors => {
        return anchors
          .map(a => ({ href: a.href, text: a.innerText }))
          .filter(a => a.href.includes('/story.php') || a.href.includes('/groups/') || a.href.includes('/posts/'));
      });

      for (const link of postLinks) {
        // استخراج معرّف أو رابط نظيف
        const cleanUrl = link.href.split('?')[0];
        if (!visitedPosts.includes(cleanUrl) && !visitedPosts.includes(link.href)) {
          // الانتقال للمنشور لقراءة نصه
          await this.page.goto(link.href, { waitUntil: 'domcontentloaded', timeout: 30000 });
          
          const postText = await this.page.evaluate(() => {
            const body = document.querySelector('p, article, .userContent, span');
            return body ? body.innerText : '';
          });

          return {
            postUrl: link.href,
            cleanUrl: cleanUrl,
            postText: postText || 'منشور بدون نص'
          };
        }
      }

      throw new Error('لم يتم العثور على منشورات جديدة غير معلق عليها');
    } catch (error) {
      throw new Error(`فشل جلب المنشور التالي: ${error.message}`);
    }
  }

  /**
   * تنفيذ تعليق منفرد على الصفحة الحالية
   */
  async submitComment(commentText) {
    try {
      const textareaSelector = 'textarea[name="comment_text"], textarea';
      await this.page.waitForSelector(textareaSelector, { timeout: 15000 });
      await this.page.type(textareaSelector, commentText, { delay: 30 });

      const submitSelector = 'input[type="submit"][name="post"], input[type="submit"]';
      await Promise.all([
        this.page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }),
        this.page.click(submitSelector)
      ]);

      return true;
    } catch (error) {
      throw new Error(`فشل كتابة التعليق: ${error.message}`);
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
