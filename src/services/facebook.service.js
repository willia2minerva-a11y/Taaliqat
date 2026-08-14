// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  /**
   * إطلاق متصفح خفيف جداً ومُحسّن لبيئة 512MB RAM
   */
  async _launchBrowser() {
    return await puppeteer.launch({
      headless: true,
      protocolTimeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process', // تشغيل المتصفح في عملية واحدة لتوفير الذاكرة
        '--disable-extensions',
        '--js-flags="--max-old-space-size=128"'
      ]
    });
  }

  /**
   * إنشاء صفحة مع حظر كامل الوسائط لتوفير الذاكرة والسرعة
   */
  async _createCleanPage(browser, rawCookies) {
    const page = await browser.newPage();
    
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet', 'other'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.setDefaultNavigationTimeout(30000);

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
   * جلب واستخراج روابط المنشورات الجديدة وإضافتها لقائمة الانتظار
   */
  async discoverPendingPosts(rawCookies, groupUrl, visitedPosts = []) {
    let browser = null;
    try {
      browser = await this._launchBrowser();
      const page = await this._createCleanPage(browser, rawCookies);
      
      await page.goto(groupUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const extractedLinks = await page.$$eval('a', anchors => {
        return anchors
          .map(a => a.href)
          .filter(href => href && (href.includes('/story.php') || href.includes('/groups/') || href.includes('/posts/')));
      });

      // تنقية الروابط واستبعاد المزارة سابقاً
      const cleanLinks = [...new Set(extractedLinks.map(l => l.split('?')[0]))];
      const newPosts = cleanLinks.filter(link => !visitedPosts.includes(link));

      return newPosts;
    } catch (error) {
      throw new Error(`فشل جلب المنشورات: ${error.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * قراءة نص منشور واحد وقفل التبويب فوراً
   */
  async fetchPostText(rawCookies, postUrl) {
    let browser = null;
    try {
      browser = await this._launchBrowser();
      const page = await this._createCleanPage(browser, rawCookies);
      
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const postText = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('p, article, div, span'));
        return elements.reduce((max, el) => {
          const text = el.innerText ? el.innerText.trim() : '';
          return text.length > max.length ? text : max;
        }, '');
      });

      return postText || 'منشور تفاعلي';
    } catch (error) {
      throw new Error(`فشل قراءة المنشور: ${error.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

  /**
   * تنفيذ التعليق المزدوج مع التباعد الإدراكي (Cognitive Spacing)
   */
  async submitDualComments(rawCookies, postUrl, aiComment, hashtag) {
    let browser = null;
    try {
      browser = await this._launchBrowser();
      const page = await this._createCleanPage(browser, rawCookies);
      
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      const selector = 'textarea[name="comment_text"], textarea';
      await page.waitForSelector(selector, { timeout: 15000 });

      // 1. نشر تعليق الذكاء الاصطناعي
      await page.type(selector, aiComment, { delay: 30 });
      const submitBtn = 'input[type="submit"][name="post"], input[type="submit"]';
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
        page.click(submitBtn)
      ]);

      // 2. التباعد الإدراكي (انتظار 10 ثوانٍ كأن البوت يفكر ويقرأ)
      await new Promise(resolve => setTimeout(resolve, 10000));

      // 3. نشر تعليق الهشتاج الثاني
      await page.waitForSelector(selector, { timeout: 15000 });
      await page.type(selector, hashtag, { delay: 30 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
        page.click(submitBtn)
      ]);

      return true;
    } catch (error) {
      throw new Error(`فشل كتابة التعليق المزدوج: ${error.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }
}

module.exports = new FacebookService();
