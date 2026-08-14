// src/services/facebook.service.js
const puppeteer = require('puppeteer-core');
const fs = require('fs');
const os = require('os');
const path = require('path');

class FacebookService {

  // =========================================================
  // Launch Chrome
  // =========================================================

  async _launchBrowser() {
    const executablePath =
      process.env.PUPPETEER_EXECUTABLE_PATH ||
      '/usr/bin/google-chrome-stable';

    console.log(`🔍 Chrome path: ${executablePath}`);

    if (!fs.existsSync(executablePath)) {
      throw new Error(
        `Chrome executable not found: ${executablePath}`
      );
    }

    const userDataDir = fs.mkdtempSync(
      path.join(os.tmpdir(), 'taaliqat-chrome-')
    );

    console.log(`📁 Chrome profile: ${userDataDir}`);

    try {
      const browser = await puppeteer.launch({
        headless: true,

        executablePath,

        userDataDir,

        protocolTimeout: 60000,

        timeout: 60000,

        dumpio: true,

        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',

          // مهم على Render
          '--disable-dev-shm-usage',

          // تقليل استهلاك الموارد
          '--disable-gpu',
          '--disable-extensions',
          '--disable-background-networking',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding',

          // منع بعض الخدمات غير الضرورية
          '--disable-sync',
          '--disable-translate',

          // تشغيل نظيف
          '--no-first-run',
          '--no-default-browser-check',

          // منع بعض النوافذ/الخدمات
          '--disable-popup-blocking',

          // حجم شاشة ثابت
          '--window-size=1280,720'
        ],

        defaultViewport: {
          width: 1280,
          height: 720
        },

        // لا نستخدم ignoreDefaultArgs
        // ولا --single-process
        // ولا pipe

        handleSIGINT: false,
        handleSIGTERM: false,
        handleSIGHUP: false
      });

      console.log('✅ Chrome launched successfully');

      browser.on('disconnected', () => {
        console.log('⚠️ Chrome disconnected');
      });

      return browser;

    } catch (error) {

      console.error(
        '❌ Chrome launch failed:',
        error.message
      );

      // تنظيف profile
      try {
        fs.rmSync(userDataDir, {
          recursive: true,
          force: true
        });
      } catch (_) {}

      throw error;
    }
  }


  // =========================================================
  // Create Facebook page
  // =========================================================

  async _createCleanPage(browser, rawCookies) {

    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(30000);
    page.setDefaultTimeout(20000);

    // حجم الصفحة
    await page.setViewport({
      width: 1280,
      height: 720
    });

    // User Agent طبيعي
    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) ' +
      'AppleWebKit/537.36 (KHTML, like Gecko) ' +
      'Chrome/131.0.0.0 Safari/537.36'
    );

    // =======================================================
    // Cookies
    // =======================================================

    if (rawCookies && Array.isArray(rawCookies)) {

      const formattedCookies = rawCookies
        .filter(cookie => cookie && cookie.name)
        .map(cookie => {

          const {
            sameSite,
            storeId,
            hostOnly,
            session,
            ...rest
          } = cookie;

          const formatted = {
            ...rest,

            domain:
              cookie.domain ||
              '.facebook.com',

            path:
              cookie.path ||
              '/',

            url:
              cookie.url ||
              'https://www.facebook.com'
          };

          // Puppeteer يقبل قيم SameSite محددة فقط
          if (
            sameSite === 'Strict' ||
            sameSite === 'Lax' ||
            sameSite === 'None'
          ) {
            formatted.sameSite = sameSite;
          }

          return formatted;
        });

      try {

        await page.setCookie(...formattedCookies);

        console.log(
          `🍪 ${formattedCookies.length} cookies loaded`
        );

      } catch (error) {

        console.error(
          `⚠️ Cookie loading error: ${error.message}`
        );
      }
    }

    // =======================================================
    // Block heavy resources
    // =======================================================

    await page.setRequestInterception(true);

    page.on('request', request => {

      const type = request.resourceType();

      // لا نمنع "other"
      // لأنه قد يحتوي على موارد يحتاجها Facebook.

      if (
        type === 'image' ||
        type === 'media' ||
        type === 'font' ||
        type === 'stylesheet'
      ) {

        request.abort().catch(() => {});

      } else {

        request.continue().catch(() => {});
      }
    });

    return page;
  }


  // =========================================================
  // Wait helper
  // =========================================================

  async _sleep(ms) {
    return new Promise(resolve =>
      setTimeout(resolve, ms)
    );
  }


  // =========================================================
  // Discover Facebook posts
  // =========================================================

  async discoverPendingPosts(
    rawCookies,
    groupUrl,
    visitedPosts = []
  ) {

    let browser = null;
    let page = null;

    try {

      console.log('🌐 Starting browser for discovery...');

      browser = await this._launchBrowser();

      page = await this._createCleanPage(
        browser,
        rawCookies
      );

      console.log(`🌐 Navigating to: ${groupUrl}`);

      await page.goto(groupUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      console.log('✅ Facebook page loaded');

      // إعطاء Facebook وقتًا لإظهار المنشورات
      await this._sleep(3000);

      // =====================================================
      // استخراج الروابط
      // =====================================================

      const extractedLinks = await page.$$eval(
        'a[href]',
        anchors => {

          const links = [];

          for (const a of anchors) {

            const href = a.href;

            if (!href) continue;

            if (
              href.includes('/posts/') ||
              href.includes('/story.php') ||
              href.includes('/permalink/') ||
              href.includes('/groups/')
            ) {
              links.push(href);
            }
          }

          return links;
        }
      );

      // =====================================================
      // تنظيف الروابط
      // =====================================================

      const cleanLinks = [
        ...new Set(
          extractedLinks.map(link => {

            try {

              const url = new URL(link);

              // حذف query parameters
              url.search = '';

              // حذف hash
              url.hash = '';

              return url.toString();

            } catch (_) {

              return link.split('?')[0];
            }
          })
        )
      ];

      // =====================================================
      // إزالة المنشورات التي تمت زيارتها
      // =====================================================

      const visitedSet = new Set(
        Array.isArray(visitedPosts)
          ? visitedPosts
          : []
      );

      const newPosts = cleanLinks.filter(
        link => !visitedSet.has(link)
      );

      console.log(
        `🔎 Extracted links: ${cleanLinks.length}`
      );

      console.log(
        `📝 New posts: ${newPosts.length}`
      );

      if (newPosts.length > 0) {

        console.log('📌 Found posts:');

        newPosts
          .slice(0, 20)
          .forEach((link, index) => {
            console.log(
              `   ${index + 1}. ${link}`
            );
          });
      }

      return newPosts;

    } catch (error) {

      console.error(
        `❌ discoverPendingPosts error: ${error.message}`
      );

      throw new Error(
        `فشل جلب المنشورات: ${error.message}`
      );

    } finally {

      // =====================================================
      // Close page
      // =====================================================

      if (page) {

        try {
          await page.close();
        } catch (_) {}
      }

      // =====================================================
      // Close browser
      // =====================================================

      if (browser) {

        try {

          await browser.close();

          console.log(
            '🔒 Browser closed successfully'
          );

        } catch (error) {

          console.log(
            `⚠️ Browser close error: ${error.message}`
          );
        }
      }
    }
  }


  // =========================================================
  // Fetch post text
  // =========================================================

  async fetchPostText(rawCookies, postUrl) {

    let browser = null;
    let page = null;

    try {

      console.log(
        `📖 Reading post: ${postUrl}`
      );

      browser = await this._launchBrowser();

      page = await this._createCleanPage(
        browser,
        rawCookies
      );

      await page.goto(postUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await this._sleep(2000);

      const postText = await page.evaluate(() => {

        const candidates = Array.from(
          document.querySelectorAll(
            'div[dir="auto"], p, article, span'
          )
        );

        let longest = '';

        for (const element of candidates) {

          const text =
            element.innerText?.trim() || '';

          if (
            text.length > longest.length &&
            text.length < 10000
          ) {
            longest = text;
          }
        }

        return longest;
      });

      console.log(
        `📄 Post text length: ${postText.length}`
      );

      return postText || 'منشور تفاعلي';

    } catch (error) {

      console.error(
        `❌ fetchPostText error: ${error.message}`
      );

      throw new Error(
        `فشل قراءة المنشور: ${error.message}`
      );

    } finally {

      if (page) {

        try {
          await page.close();
        } catch (_) {}
      }

      if (browser) {

        try {
          await browser.close();
        } catch (_) {}
      }
    }
  }


  // =========================================================
  // Submit two comments
  // =========================================================

  async submitDualComments(
    rawCookies,
    postUrl,
    aiComment,
    hashtag
  ) {

    let browser = null;
    let page = null;

    try {

      console.log(
        `💬 Opening post for comments: ${postUrl}`
      );

      browser = await this._launchBrowser();

      page = await this._createCleanPage(
        browser,
        rawCookies
      );

      await page.goto(postUrl, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await this._sleep(2500);

      const selector =
        'textarea[name="comment_text"], textarea';

      await page.waitForSelector(
        selector,
        {
          timeout: 15000
        }
      );

      // =====================================================
      // First comment
      // =====================================================

      console.log('💬 Writing AI comment...');

      await page.click(selector);

      await page.type(
        selector,
        aiComment,
        {
          delay: 20
        }
      );

      const submitBtn =
        'input[type="submit"][name="post"], input[type="submit"]';

      await page.waitForSelector(
        submitBtn,
        {
          timeout: 10000
        }
      );

      await page.click(submitBtn);

      await this._sleep(5000);

      console.log('✅ First comment submitted');

      // =====================================================
      // Second comment
      // =====================================================

      await page.waitForSelector(
        selector,
        {
          timeout: 15000
        }
      );

      console.log('💬 Writing hashtag comment...');

      await page.click(selector);

      await page.type(
        selector,
        hashtag,
        {
          delay: 20
        }
      );

      await page.click(submitBtn);

      await this._sleep(5000);

      console.log(
        '✅ Second comment submitted'
      );

      return true;

    } catch (error) {

      console.error(
        `❌ submitDualComments error: ${error.message}`
      );

      throw new Error(
        `فشل كتابة التعليق المزدوج: ${error.message}`
      );

    } finally {

      if (page) {

        try {
          await page.close();
        } catch (_) {}
      }

      if (browser) {

        try {
          await browser.close();
        } catch (_) {}
      }
    }
  }
}

module.exports = new FacebookService();
