// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  async _launchBrowser() {
    // استخدام Chrome النظام إن وجد، أو تنزيله تلقائياً
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || undefined;
    
    return await puppeteer.launch({
      headless: true,
      executablePath: executablePath,
      protocolTimeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process',
        '--disable-extensions',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--js-flags="--max-old-space-size=128"'
      ]
    });
  }

  async _createCleanPage(browser, rawCookies) {
    const page = await browser.newPage();
    
    // تعطيل تحميل الصور والوسائط لتوفير الذاكرة
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

    // إعداد الكوكيز
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

      const cleanLinks = [...new Set(extractedLinks.map(l => l.split('?')[0]))];
      const newPosts = cleanLinks.filter(link => !visitedPosts.includes(link));

      return newPosts;
    } catch (error) {
      throw new Error(`فشل جلب المنشورات: ${error.message}`);
    } finally {
      if (browser) await browser.close().catch(() => {});
    }
  }

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

  async submitDualComments(rawCookies, postUrl, aiComment, hashtag) {
    let browser = null;
    try {
      browser = await this._launchBrowser();
      const page = await this._createCleanPage(browser, rawCookies);
      
      await page.goto(postUrl, { waitUntil: 'domcontentloaded', timeout: 30000 });

      // كتابة التعليق الأول (AI)
      const selector = 'textarea[name="comment_text"], textarea';
      await page.waitForSelector(selector, { timeout: 15000 });

      await page.type(selector, aiComment, { delay: 30 });
      const submitBtn = 'input[type="submit"][name="post"], input[type="submit"]';
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 20000 }).catch(() => {}),
        page.click(submitBtn)
      ]);

      // انتظار 10 ثواني بين التعليقات
      await new Promise(resolve => setTimeout(resolve, 10000));

      // كتابة التعليق الثاني (الهاشتاج)
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
