// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.browser = null;
  }

  /**
   * تهيئة المتصفح المستقر لبيئة Render المحدودة
   */
  async _getBrowser() {
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
    return this.browser;
  }

  /**
   * إنشاء تبويب جديد وتهيئته مع الكوكيز والحظر اللطيف للوسائط
   */
  async _createCleanPage(rawCookies) {
    const browser = await this._getBrowser();
    const page = await browser.newPage();

    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const resourceType = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet'].includes(resourceType)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.setDefaultNavigationTimeout(35000);

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

    return page;
  }

  /**
   * جلب المنشور التالي بشكل معزول وآمن تماماً
   */
  async fetchNextPost(rawCookies, groupUrl, visitedPosts = []) {
    let mainPage = null;

    try {
      mainPage = await this._createCleanPage(rawCookies);
      await mainPage.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

      // 1. استخراج كل الروابط المتاحة أولاً دفعة واحدة
      const candidateLinks = await mainPage.$$eval('a', anchors => {
        return anchors
          .map(a => a.href)
          .filter(href => href && (href.includes('/story.php') || href.includes('/groups/') || href.includes('/posts/')));
      });

      // إغلاق التبويب الرئيسي فوراً لتوفير الذاكرة
      await mainPage.close();
      mainPage = null;

      // 2. البحث عن أول رابط لم يتم زيارته
      for (const linkUrl of candidateLinks) {
        const cleanUrl = linkUrl.split('?')[0];

        if (!visitedPosts.includes(cleanUrl) && !visitedPosts.includes(linkUrl)) {
          // فتح تبويب معزول خصيصاً لمطالعة المنشور المستهدف
          let postPage = null;
          try {
            postPage = await this._createCleanPage(rawCookies);
            await postPage.goto(linkUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

            // قراءة النص بحذر
            const postText = await postPage.evaluate(() => {
              const elements = Array.from(document.querySelectorAll('p, article, div, span'));
              const longestTextNode = elements.reduce((max, el) => {
                const text = el.innerText ? el.innerText.trim() : '';
                return text.length > max.length ? text : max;
              }, '');
              return longestTextNode;
            });

            await postPage.close();

            return {
              postUrl: linkUrl,
              cleanUrl: cleanUrl,
              postText: postText || 'منشور تفاعلي مصور'
            };

          } catch (singlePostError) {
            console.warn(`⚠️ تعذر جلب تفاصيل المنشور (${linkUrl}): ${singlePostError.message}`);
            if (postPage) await postPage.close().catch(() => {});
            // استمرار الحلقة لتقييم الرابط التالي
          }
        }
      }

      throw new Error('لم يتم العثور على منشورات جديدة غير معلق عليها حالياً');

    } catch (error) {
      if (mainPage) await mainPage.close().catch(() => {});
      throw new Error(`فشل جلب المنشور التالي: ${error.message}`);
    }
  }

  /**
   * تنفيذ كتابة ونشر التعليق على رابط منشور محدد
   */
  async submitComment(rawCookies, postUrl, commentText) {
    let page = null;
    try {
      page = await this._createCleanPage(rawCookies);
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 35000 });

      const textareaSelector = 'textarea[name="comment_text"], textarea';
      await page.waitForSelector(textareaSelector, { timeout: 15000 });
      await page.type(textareaSelector, commentText, { delay: 40 });

      const submitSelector = 'input[type="submit"][name="post"], input[type="submit"]';
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 30000 }).catch(() => {}),
        page.click(submitSelector)
      ]);

      return true;
    } catch (error) {
      throw new Error(`فشل كتابة التعليق: ${error.message}`);
    } finally {
      if (page) await page.close().catch(() => {});
    }
  }

  /**
   * إغلاق المتصفح عند إيقاف الخدمة
   */
  async close() {
    if (this.browser) {
      await this.browser.close().catch(() => {});
      this.browser = null;
    }
  }
}

module.exports = new FacebookService();
