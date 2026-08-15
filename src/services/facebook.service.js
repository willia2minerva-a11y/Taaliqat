const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.maxRetries = 2;
    this.navigationTimeout = 30000;
    this.actionTimeout = 20000;
  }

  // =========================================================
  // Launch Browser
  // =========================================================

  async _launchBrowser() {
    console.log('🔍 Launching Chromium...');

    const browser = await puppeteer.launch({
      headless: true,

      timeout: 60000,
      protocolTimeout: 60000,

      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',

        '--disable-gpu',
        '--disable-software-rasterizer',

        '--disable-background-networking',
        '--disable-background-timer-throttling',
        '--disable-backgrounding-occluded-windows',
        '--disable-renderer-backgrounding',

        '--disable-extensions',
        '--disable-sync',
        '--disable-translate',
        '--disable-default-apps',

        '--no-first-run',
        '--no-default-browser-check',

        '--disable-notifications',
        '--disable-popup-blocking',

        '--disable-features=Translate,BackForwardCache',

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
      throw new Error('Chromium is not connected');
    }

    browser.on('disconnected', () => {
      console.warn('⚠️ Chromium disconnected');
    });

    return browser;
  }

  // =========================================================
  // Create Page
  // =========================================================

  async _createCleanPage(browser, rawCookies) {
    if (!browser || !browser.isConnected()) {
      throw new Error('Browser is not connected');
    }

    const page = await browser.newPage();

    page.setDefaultNavigationTimeout(
      this.navigationTimeout
    );

    page.setDefaultTimeout(
      this.actionTimeout
    );

    // -------------------------------------------------------
    // Block unnecessary resources
    // -------------------------------------------------------

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
      } catch {}
    });

    // -------------------------------------------------------
    // Cookies
    // -------------------------------------------------------

    if (
      Array.isArray(rawCookies) &&
      rawCookies.length > 0
    ) {
      const cookies = rawCookies
        .filter(
          cookie =>
            cookie &&
            cookie.name &&
            cookie.value
        )
        .map(cookie => {
          const formatted = {
            name: cookie.name,
            value: String(cookie.value),

            domain:
              cookie.domain ||
              '.facebook.com',

            path:
              cookie.path ||
              '/',

            secure:
              cookie.secure !== false,

            httpOnly:
              Boolean(cookie.httpOnly)
          };

          if (
            cookie.expires &&
            Number(cookie.expires) > 0
          ) {
            formatted.expires =
              Number(cookie.expires);
          }

          return formatted;
        });

      if (cookies.length > 0) {
        try {
          await page.setCookie(...cookies);

          console.log(
            `🍪 Loaded ${cookies.length} cookies`
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
  // Safe Close
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
    } catch {}
  }

  // =========================================================
  // Retry
  // =========================================================

  async _withRetry(operation, name) {
    let lastError;

    for (
      let attempt = 1;
      attempt <= this.maxRetries;
      attempt++
    ) {
      try {
        console.log(
          `🔄 ${name} - attempt ${attempt}/${this.maxRetries}`
        );

        return await operation();

      } catch (error) {
        lastError = error;

        console.error(
          `❌ ${name} attempt ${attempt}: ${error.message}`
        );

        if (
          attempt <
          this.maxRetries
        ) {
          await new Promise(resolve =>
            setTimeout(
              resolve,
              attempt * 2500
            )
          );
        }
      }
    }

    throw lastError;
  }

  // =========================================================
  // Discover ALL posts
  // =========================================================

  async discoverPendingPosts(
    rawCookies,
    groupUrl
  ) {
    return this._withRetry(
      async () => {
        let browser = null;
        let page = null;

        try {
          console.log(
            '🌐 Starting browser for discovery...'
          );

          browser =
            await this._launchBrowser();

          page =
            await this._createCleanPage(
              browser,
              rawCookies
            );

          console.log(
            `🌐 Navigating to: ${groupUrl}`
          );

          await page.goto(groupUrl, {
            waitUntil:
              'domcontentloaded',

            timeout:
              this.navigationTimeout
          });

          // -------------------------------------------------
          // Wait for Facebook feed
          // -------------------------------------------------

          await new Promise(resolve =>
            setTimeout(resolve, 4000)
          );

          // -------------------------------------------------
          // Scroll to load more posts
          // -------------------------------------------------

          for (let i = 0; i < 4; i++) {
            await page.evaluate(() => {
              window.scrollBy(
                0,
                1000
              );
            });

            await new Promise(resolve =>
              setTimeout(
                resolve,
                1200
              )
            );
          }

          // -------------------------------------------------
          // Extract post links
          // -------------------------------------------------

          const links =
            await page.$$eval(
              'a[href]',
              anchors => {
                const result =
                  new Set();

                for (
                  const anchor
                  of anchors
                ) {
                  const href =
                    anchor.href;

                  if (!href)
                    continue;

                  try {
                    const url =
                      new URL(href);

                    const path =
                      url.pathname;

                    const isPost =
                      path.includes(
                        '/posts/'
                      ) ||
                      path.includes(
                        '/story.php'
                      ) ||
                      path.includes(
                        '/permalink/'
                      ) ||
                      path.includes(
                        '/photo/'
                      ) ||
                      path.includes(
                        '/videos/'
                      ) ||
                      path.includes(
                        '/reel/'
                      );

                    if (!isPost)
                      continue;

                    // Remove tracking
                    // parameters
                    url.searchParams.delete(
                      'ref'
                    );

                    url.searchParams.delete(
                      'refid'
                    );

                    url.searchParams.delete(
                      'notif_id'
                    );

                    url.searchParams.delete(
                      'notif_t'
                    );

                    result.add(
                      url.toString()
                    );

                  } catch {}
                }

                return [
                  ...result
                ];
              }
            );

          console.log(
            `🔎 Total posts found: ${links.length}`
          );

          return links;

        } finally {
          await this._closePage(
            page
          );

          await this._closeBrowser(
            browser
          );

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
  // Fetch Post Text
  // =========================================================

  async fetchPostText(
    rawCookies,
    postUrl
  ) {
    return this._withRetry(
      async () => {
        let browser = null;
        let page = null;

        try {
          console.log(
            `📖 Reading post: ${postUrl}`
          );

          browser =
            await this._launchBrowser();

          page =
            await this._createCleanPage(
              browser,
              rawCookies
            );

          await page.goto(
            postUrl,
            {
              waitUntil:
                'domcontentloaded',

              timeout:
                this.navigationTimeout
            }
          );

          await new Promise(resolve =>
            setTimeout(resolve, 2500)
          );

          const postText =
            await page.evaluate(() => {
              const elements =
                document.querySelectorAll(
                  'article, [role="article"], p, div'
                );

              const texts = [];

              for (
                const element
                of elements
              ) {
                const text =
                  element.innerText
                    ?.replace(
                      /\s+/g,
                      ' '
                    )
                    .trim();

                if (
                  text &&
                  text.length >= 20
                ) {
                  texts.push(text);
                }
              }

              texts.sort(
                (a, b) =>
                  b.length -
                  a.length
              );

              return (
                texts[0] || ''
              );
            });

          return (
            postText ||
            'منشور تفاعلي'
          );

        } finally {
          await this._closePage(
            page
          );

          await this._closeBrowser(
            browser
          );

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
  // Submit Comments
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
            `💬 Opening post: ${postUrl}`
          );

          browser =
            await this._launchBrowser();

          page =
            await this._createCleanPage(
              browser,
              rawCookies
            );

          await page.goto(
            postUrl,
            {
              waitUntil:
                'domcontentloaded',

              timeout:
                this.navigationTimeout
            }
          );

          await new Promise(resolve =>
            setTimeout(resolve, 2500)
          );

          const selector =
            'textarea[name="comment_text"], textarea';

          await page.waitForSelector(
            selector,
            {
              timeout: 15000
            }
          );

          // -------------------------------------------------
          // AI comment
          // -------------------------------------------------

          if (
            aiComment &&
            aiComment.trim()
          ) {
            await page.click(
              selector
            );

            await page.type(
              selector,
              aiComment.trim(),
              {
                delay: 15
              }
            );

            const submitButton =
              'input[type="submit"][name="post"], input[type="submit"]';

            await page.waitForSelector(
              submitButton,
              {
                timeout: 10000
              }
            );

            await page.click(
              submitButton
            );

            await new Promise(resolve =>
              setTimeout(
                resolve,
                5000
              )
            );

            console.log(
              '✅ AI comment submitted'
            );
          }

          // -------------------------------------------------
          // Hashtag
          // -------------------------------------------------

          if (
            hashtag &&
            hashtag.trim()
          ) {
            try {
              await page.waitForSelector(
                selector,
                {
                  timeout: 10000
                }
              );
            } catch {
              await page.goto(
                postUrl,
                {
                  waitUntil:
                    'domcontentloaded',

                  timeout:
                    this.navigationTimeout
                }
              );

              await new Promise(
                resolve =>
                  setTimeout(
                    resolve,
                    2500
                  )
              );

              await page.waitForSelector(
                selector,
                {
                  timeout: 15000
                }
              );
            }

            await page.click(
              selector
            );

            await page.type(
              selector,
              hashtag.trim(),
              {
                delay: 15
              }
            );

            const submitButton =
              'input[type="submit"][name="post"], input[type="submit"]';

            await page.waitForSelector(
              submitButton,
              {
                timeout: 10000
              }
            );

            await page.click(
              submitButton
            );

            await new Promise(resolve =>
              setTimeout(
                resolve,
                5000
              )
            );

            console.log(
              '🏷️ Hashtag comment submitted'
            );
          }

          return true;

        } finally {
          await this._closePage(
            page
          );

          await this._closeBrowser(
            browser
          );

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

module.exports =
  new FacebookService();
