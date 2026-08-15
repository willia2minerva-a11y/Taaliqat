// src/services/facebook.service.js

const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.maxRetries = 2;
    this.navigationTimeout = 30000;
    this.actionTimeout = 20000;
  }

  // =========================================================
  // Browser
  // =========================================================

  async _launchBrowser() {
    console.log('🔍 Launching Chromium...');

    const browser = await puppeteer.launch({
      headless: true,

      protocolTimeout: 60000,
      timeout: 60000,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',

        // مهم جداً على Render
        '--disable-dev-shm-usage',

        // تقليل استهلاك الذاكرة
        '--disable-gpu',
        '--disable-software-rasterizer',
        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',

        // منع الخدمات غير الضرورية
        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--disable-default-apps',
        '--no-first-run',
        '--no-default-browser-check',

        // تقليل العمليات غير الضرورية
        '--disable-features=Translate,BackForwardCache',

        // تحسين الاستقرار في السيرفر
        '--disable-popup-blocking',
        '--disable-notifications',

        // حجم نافذة ثابت
        '--window-size=1280,720'
      ],

      defaultViewport: {
        width: 1280,
        height: 720,
        deviceScaleFactor: 1
      },

      handleSIGINT: false,
      handleSIGTERM: false,
      handleSIGHUP: false
    });

    console.log('✅ Chromium launched');

    if (!browser.isConnected()) {
      throw new Error('Chromium launched but is not connected');
    }

    browser.on('disconnected', () => {
      console.warn('⚠️ Chromium disconnected');
    });

    return browser;
  }

  // =========================================================
  // Page
  // =========================================================

  async _createCleanPage(browser, rawCookies) {
    if (!browser || !browser.isConnected()) {
      throw new Error('Browser is not connected');
    }

    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(this.navigationTimeout);
    page.setDefaultTimeout(this.actionTimeout);

    // منع تحميل الأشياء غير الضرورية
    await page.setRequestInterception(true);

    page.on('request', request => {
      try {
        const type = request.resourceType();

        if (
          [
            'image',
            'media',
            'font',
            'stylesheet',
            'manifest'
          ].includes(type)
        ) {
          request.abort();
        } else {
          request.continue();
        }
      } catch {
        // request قد يكون انتهى
      }
    });

    // منع بعض النوافذ والإعلانات
    page.on('dialog', async dialog => {
      try {
        await dialog.dismiss();
      } catch {}
    });

    // =======================================================
    // Cookies
    // =======================================================

    if (Array.isArray(rawCookies) && rawCookies.length > 0) {
      const formattedCookies = rawCookies
        .filter(cookie => cookie && cookie.name && cookie.value)
        .map(cookie => {
          const formatted = {
            name: cookie.name,
            value: String(cookie.value),
            domain: cookie.domain || '.facebook.com',
            path: cookie.path || '/',
            secure: cookie.secure !== false,
            httpOnly: Boolean(cookie.httpOnly)
          };

          if (cookie.expires && Number(cookie.expires) > 0) {
            formatted.expires = Number(cookie.expires);
          }

          if (cookie.sameSite) {
            const sameSite = String(cookie.sameSite).toLowerCase();

            if (
              ['strict', 'lax', 'none'].includes(sameSite)
            ) {
              formatted.sameSite =
                sameSite.charAt(0).toUpperCase() +
                sameSite.slice(1);
            }
          }

          return formatted;
        });

      if (formattedCookies.length > 0) {
        try {
          await page.setCookie(...formattedCookies);
          console.log(
            `🍪 Loaded ${formattedCookies.length} cookies`
          );
        } catch (error) {
          console.warn(
            `⚠️ Cookie warning: ${error.message}`
          );
        }
      }
    }

    return page;
  }

  // =========================================================
  // Safe close
  // =========================================================

  async _closePage(page) {
    if (!page) return;

    try {
      if (!page.isClosed()) {
        await page.close();
      }
    } catch {}
  }

  async _closeBrowser(browser) {
    if (!browser) return;

    try {
      if (browser.isConnected()) {
        await browser.close();
      }
    } catch (error) {
      console.warn(
        `⚠️ Browser close warning: ${error.message}`
      );
    }
  }

  // =========================================================
  // Retry helper
  // =========================================================

  async _withRetry(operation, operationName) {
    let lastError = null;

    for (let attempt = 1; attempt <= this.maxRetries; attempt++) {
      try {
        console.log(
          `🔄 ${operationName} - attempt ${attempt}/${this.maxRetries}`
        );

        return await operation();

      } catch (error) {
        lastError = error;

        console.error(
          `❌ ${operationName} attempt ${attempt}: ${error.message}`
        );

        if (attempt < this.maxRetries) {
          const delay = attempt * 2500;

          console.log(
            `⏳ Retrying in ${delay}ms...`
          );

          await new Promise(resolve =>
            setTimeout(resolve, delay)
          );

          // محاولة تنظيف الذاكرة
          if (global.gc) {
            try {
              global.gc();
            } catch {}
          }
        }
      }
    }

    throw lastError;
  }

  // =========================================================
  // Discover posts
  // =========================================================

  async discoverPendingPosts(
    rawCookies,
    groupUrl,
    visitedPosts = []
  ) {
    return this._withRetry(
      async () => {
        let browser = null;
        let page = null;

        try {
          console.log(
            '🌐 Starting browser for discovery...'
          );

          browser = await this._launchBrowser();

          page = await this._createCleanPage(
            browser,
            rawCookies
          );

          console.log(
            `🌐 Navigating to: ${groupUrl}`
          );

          await page.goto(groupUrl, {
            waitUntil: 'domcontentloaded',
            timeout: this.navigationTimeout
          });

          // إعطاء Facebook وقتاً بسيطاً لتوليد الروابط
          await new Promise(resolve =>
            setTimeout(resolve, 2500)
          );

          const extractedLinks = await page.$$eval(
            'a',
            anchors => {
              return anchors
                .map(a => a.href)
                .filter(href => {
                  if (!href) return false;

                  return (
                    href.includes('/story.php') ||
                    href.includes('/groups/') ||
                    href.includes('/posts/')
                  );
                });
            }
          );

          const cleanLinks = [
            ...new Set(
              extractedLinks.map(link => {
                try {
                  const url = new URL(link);

                  // إزالة tracking parameters
                  url.search = '';

                  return url.toString();
                } catch {
                  return link.split('?')[0];
                }
              })
            )
          ];

          const visitedSet = new Set(
            Array.isArray(visitedPosts)
              ? visitedPosts
              : []
          );

          const newPosts = cleanLinks.filter(
            link => !visitedSet.has(link)
          );

          console.log(
            `📝 Found ${newPosts.length} new posts`
          );

          return newPosts;

        } finally {
          await this._closePage(page);
          await this._closeBrowser(browser);

          if (global.gc) {
            try {
              global.gc();
            } catch {}
          }
        }
      },
      'discoverPendingPosts'
    );
  }

  // =========================================================
  // Fetch post text
  // =========================================================

  async fetchPostText(rawCookies, postUrl) {
    return this._withRetry(
      async () => {
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
            timeout: this.navigationTimeout
          });

          await new Promise(resolve =>
            setTimeout(resolve, 2000)
          );

          const postText = await page.evaluate(() => {
            const candidates = [];

            const elements = document.querySelectorAll(
              'article, [role="article"], p, div'
            );

            for (const element of elements) {
              const text =
                element.innerText
                  ?.replace(/\s+/g, ' ')
                  .trim();

              if (!text) continue;

              // تجاهل النصوص الصغيرة جداً
              if (text.length < 20) continue;

              candidates.push(text);
            }

            // الأطول غالباً يحتوي محتوى المنشور
            candidates.sort(
              (a, b) => b.length - a.length
            );

            return candidates[0] || '';
          });

          console.log(
            `📄 Extracted text length: ${
              postText?.length || 0
            }`
          );

          return postText || 'منشور تفاعلي';

        } finally {
          await this._closePage(page);
          await this._closeBrowser(browser);

          if (global.gc) {
            try {
              global.gc();
            } catch {}
          }
        }
      },
      'fetchPostText'
    );
  }

  // =========================================================
  // Submit comments
  // =========================================================

  async submitDualComments(
    rawCookies,
    postUrl,
    aiComment,
    hashtag
  ) {
    return this._withRetry(
      async () => {
        let browser = null;
        let page = null;

        try {
          console.log(
            `💬 Opening post for commenting: ${postUrl}`
          );

          browser = await this._launchBrowser();

          page = await this._createCleanPage(
            browser,
            rawCookies
          );

          await page.goto(postUrl, {
            waitUntil: 'domcontentloaded',
            timeout: this.navigationTimeout
          });

          await new Promise(resolve =>
            setTimeout(resolve, 2500)
          );

          const selector =
            'textarea[name="comment_text"], textarea';

          await page.waitForSelector(selector, {
            timeout: 15000
          });

          // =================================================
          // First comment
          // =================================================

          if (
            typeof aiComment === 'string' &&
            aiComment.trim()
          ) {
            console.log('💬 Writing AI comment...');

            await page.click(selector);

            await page.type(
              selector,
              aiComment.trim(),
              {
                delay: 15
              }
            );

            const submitBtn =
              'input[type="submit"][name="post"], input[type="submit"]';

            await page.waitForSelector(submitBtn, {
              timeout: 10000
            });

            await page.click(submitBtn);

            await new Promise(resolve =>
              setTimeout(resolve, 5000)
            );

            console.log(
              '✅ First comment submitted'
            );
          }

          // =================================================
          // Second comment / hashtag
          // =================================================

          if (
            typeof hashtag === 'string' &&
            hashtag.trim()
          ) {
            console.log(
              '🏷️ Preparing second comment...'
            );

            // الصفحة قد تتغير بعد إرسال التعليق
            try {
              await page.waitForSelector(
                selector,
                { timeout: 10000 }
              );
            } catch {
              console.log(
                '🔄 Comment box disappeared, reloading post...'
              );

              await page.goto(postUrl, {
                waitUntil: 'domcontentloaded',
                timeout: this.navigationTimeout
              });

              await new Promise(resolve =>
                setTimeout(resolve, 2500)
              );

              await page.waitForSelector(
                selector,
                { timeout: 15000 }
              );
            }

            await page.click(selector);

            await page.type(
              selector,
              hashtag.trim(),
              {
                delay: 15
              }
            );

            const submitBtn =
              'input[type="submit"][name="post"], input[type="submit"]';

            await page.waitForSelector(submitBtn, {
              timeout: 10000
            });

            await page.click(submitBtn);

            await new Promise(resolve =>
              setTimeout(resolve, 5000)
            );

            console.log(
              '✅ Second comment submitted'
            );
          }

          return true;

        } finally {
          await this._closePage(page);
          await this._closeBrowser(browser);

          if (global.gc) {
            try {
              global.gc();
            } catch {}
          }
        }
      },
      'submitDualComments'
    );
  }
}

module.exports = new FacebookService();
