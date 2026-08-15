// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  async _launchBrowser() {
    console.log('🔍 Launching browser...');
    
    // ✅ استخدام Puppeteer العادي مع تنزيل Chrome تلقائياً
    return await puppeteer.launch({
      headless: 'new',  // ✅ استخدام الوضع الجديد لـ headless
      protocolTimeout: 60000,
      timeout: 60000,
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
        '--js-flags="--max-old-space-size=128"',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--max_old_space_size=128',
        '--disable-ipc-flooding-protection'
      ],
      defaultViewport: null,
      ignoreDefaultArgs: ['--disable-extensions'],
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    });
  }

  async _createCleanPage(browser, rawCookies) {
    const page = await browser.newPage();
    
    // تعطيل تحميل الصور والوسائط
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet', 'other', 'manifest', 'preflight'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    page.setDefaultNavigationTimeout(25000);
    page.setDefaultTimeout(20000);

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
      console.log('🌐 Starting browser for discovery...');
      browser = await this._launchBrowser();
      
      // ✅ التحقق من أن المتصفح مفتوح
      if (!browser || !browser.isConnected()) {
        throw new Error('Browser failed to launch');
      }
      
      const page = await this._createCleanPage(browser, rawCookies);
      
      console.log(`🌐 Navigating to: ${groupUrl}`);
      await page.goto(groupUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 25000 
      });

      // ✅ انتظار تحميل الصفحة
      await page.waitForSelector('a', { timeout: 10000 });

      const extractedLinks = await page.$$eval('a', anchors => {
        return anchors
          .map(a => a.href)
          .filter(href => href && (href.includes('/story.php') || href.includes('/groups/') || href.includes('/posts/')));
      });

      const cleanLinks = [...new Set(extractedLinks.map(l => l.split('?')[0]))];
      const newPosts = cleanLinks.filter(link => !visitedPosts.includes(link));

      console.log(`📝 Found ${newPosts.length} new posts`);
      
      // ✅ إغلاق آمن
      await page.close().catch(() => {});
      
      return newPosts;
    } catch (error) {
      console.error(`❌ discoverPendingPosts error: ${error.message}`);
      throw new Error(`فشل جلب المنشورات: ${error.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('🔒 Browser closed');
        } catch (e) {
          console.log('⚠️ Error closing browser:', e.message);
        }
      }
    }
  }

  async fetchPostText(rawCookies, postUrl) {
    let browser = null;
    try {
      browser = await this._launchBrowser();
      const page = await this._createCleanPage(browser, rawCookies);
      
      await page.goto(postUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 25000 
      });

      await page.waitForSelector('p, article, div', { timeout: 10000 });

      const postText = await page.evaluate(() => {
        const elements = Array.from(document.querySelectorAll('p, article, div, span'));
        return elements.reduce((max, el) => {
          const text = el.innerText ? el.innerText.trim() : '';
          return text.length > max.length ? text : max;
        }, '');
      });

      await page.close().catch(() => {});
      return postText || 'منشور تفاعلي';
    } catch (error) {
      console.error(`❌ fetchPostText error: ${error.message}`);
      throw new Error(`فشل قراءة المنشور: ${error.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {}
      }
    }
  }

  async submitDualComments(rawCookies, postUrl, aiComment, hashtag) {
    let browser = null;
    try {
      browser = await this._launchBrowser();
      const page = await this._createCleanPage(browser, rawCookies);
      
      await page.goto(postUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 25000 
      });

      const selector = 'textarea[name="comment_text"], textarea';
      await page.waitForSelector(selector, { timeout: 15000 });

      await page.type(selector, aiComment, { delay: 20 });
      const submitBtn = 'input[type="submit"][name="post"], input[type="submit"]';
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        page.click(submitBtn)
      ]);

      await new Promise(resolve => setTimeout(resolve, 8000));

      await page.waitForSelector(selector, { timeout: 15000 });
      await page.type(selector, hashtag, { delay: 20 });
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        page.click(submitBtn)
      ]);

      await page.close().catch(() => {});
      return true;
    } catch (error) {
      console.error(`❌ submitDualComments error: ${error.message}`);
      throw new Error(`فشل كتابة التعليق المزدوج: ${error.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
        } catch (e) {}
      }
    }
  }
}

module.exports = new FacebookService();
