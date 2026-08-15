// src/services/facebook.service.js
const puppeteer = require('puppeteer-core');

class FacebookService {
  async _launchBrowser() {
    const executablePath = process.env.PUPPETEER_EXECUTABLE_PATH || '/usr/bin/google-chrome-stable';
    
    console.log(`🔍 Launching browser with: ${executablePath}`);
    
    return await puppeteer.launch({
      headless: true,
      executablePath: executablePath,
      protocolTimeout: 60000,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',  // ✅ مهم جداً للذاكرة المحدودة
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu',
        '--single-process',         // ✅ يقلل استهلاك الذاكرة
        '--disable-extensions',
        '--disable-web-security',
        '--disable-features=IsolateOrigins,site-per-process',
        '--js-flags="--max-old-space-size=128"',
        // ✅ إضافات جديدة لتقليل الذاكرة
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',
        '--disable-ipc-flooding-protection',
        '--max_old_space_size=128'
      ],
      // ✅ إعدادات إضافية
      defaultViewport: null,
      ignoreDefaultArgs: ['--disable-extensions'],
      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    });
  }

  async _createCleanPage(browser, rawCookies) {
    const page = await browser.newPage();
    
    // ✅ تعطيل كل ما يستهلك ذاكرة
    await page.setRequestInterception(true);
    page.on('request', (req) => {
      const type = req.resourceType();
      if (['image', 'media', 'font', 'stylesheet', 'other', 'manifest', 'preflight'].includes(type)) {
        req.abort();
      } else {
        req.continue();
      }
    });

    // ✅ تقليل وقت الانتظار
    page.setDefaultNavigationTimeout(20000);
    page.setDefaultTimeout(15000);

    // ✅ تعطيل JavaScript غير الضروري
    await page.setJavaScriptEnabled(true);

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
      console.log(`🌐 Starting browser for discovery...`);
      browser = await this._launchBrowser();
      
      const page = await this._createCleanPage(browser, rawCookies);
      
      console.log(`🌐 Navigating to: ${groupUrl}`);
      await page.goto(groupUrl, { 
        waitUntil: 'domcontentloaded', 
        timeout: 20000 
      });

      // ✅ انتظار قصير لتحميل المحتوى
      await page.waitForTimeout(2000);

      const extractedLinks = await page.$$eval('a', anchors => {
        return anchors
          .map(a => a.href)
          .filter(href => href && (href.includes('/story.php') || href.includes('/groups/') || href.includes('/posts/')));
      });

      const cleanLinks = [...new Set(extractedLinks.map(l => l.split('?')[0]))];
      const newPosts = cleanLinks.filter(link => !visitedPosts.includes(link));

      console.log(`📝 Found ${newPosts.length} new posts`);
      
      // ✅ إغلاق الصفحة قبل إغلاق المتصفح
      await page.close().catch(() => {});
      
      return newPosts;
    } catch (error) {
      console.error(`❌ discoverPendingPosts error: ${error.message}`);
      throw new Error(`فشل جلب المنشورات: ${error.message}`);
    } finally {
      if (browser) {
        try {
          await browser.close();
          console.log('🔒 Browser closed successfully');
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
        timeout: 20000 
      });

      await page.waitForTimeout(1500);

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
        timeout: 20000 
      });

      // كتابة التعليق الأول (AI)
      const selector = 'textarea[name="comment_text"], textarea';
      await page.waitForSelector(selector, { timeout: 10000 });

      await page.type(selector, aiComment, { delay: 20 });
      const submitBtn = 'input[type="submit"][name="post"], input[type="submit"]';
      
      await Promise.all([
        page.waitForNavigation({ waitUntil: 'domcontentloaded', timeout: 15000 }).catch(() => {}),
        page.click(submitBtn)
      ]);

      // انتظار 8 ثواني بين التعليقات
      await new Promise(resolve => setTimeout(resolve, 8000));

      // كتابة التعليق الثاني (الهاشتاج)
      await page.waitForSelector(selector, { timeout: 10000 });
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
