// src/services/facebook.service.js

const puppeteer = require('puppeteer');

class FacebookService {

  constructor() {

    this.maxRetries = 2;

    this.navigationTimeout = 35000;

    this.actionTimeout = 20000;

    this.debug =
      String(
        process.env.FACEBOOK_DEBUG || ''
      ).toLowerCase() === 'true';

    this.debugScreenshot =
      String(
        process.env.FACEBOOK_DEBUG_SCREENSHOT || ''
      ).toLowerCase() === 'true';
  }

  // =========================================================
  // LOGGING
  // =========================================================

  _log(message) {
    console.log(`[FACEBOOK] ${message}`);
  }

  _warn(message) {
    console.warn(`[FACEBOOK][WARN] ${message}`);
  }

  _error(stage, error) {

    console.error(
      `[FACEBOOK][${stage}] ${
        error?.message || error
      }`
    );

    if (error?.stack) {
      console.error(error.stack);
    }
  }

  _debug(message, data = null) {

    if (!this.debug) {
      return;
    }

    if (data === null) {

      console.log(
        `[FACEBOOK][DEBUG] ${message}`
      );

      return;
    }

    console.log(
      `[FACEBOOK][DEBUG] ${message}`,
      typeof data === 'string'
        ? data
        : JSON.stringify(
            data,
            null,
            2
          )
    );
  }

  // =========================================================
  // BROWSER
  // =========================================================

  async _launchBrowser() {

    this._log(
      '🔍 Launching Chromium...'
    );

    try {

      const browser =
        await puppeteer.launch({

          headless: true,

          timeout: 60000,

          protocolTimeout: 60000,

          dumpio: this.debug,

          args: [

            '--no-sandbox',

            '--disable-setuid-sandbox',

            '--disable-dev-shm-usage',

            '--disable-gpu',

            '--disable-software-rasterizer',

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

      if (
        !browser ||
        !browser.isConnected()
      ) {

        throw new Error(
          'Chromium launched but browser is not connected'
        );
      }

      this._log(
        '✅ Chromium launched'
      );

      browser.on(
        'disconnected',
        () => {
          this._warn(
            '⚠️ Chromium disconnected'
          );
        }
      );

      return browser;

    } catch (error) {

      this._error(
        'BROWSER',
        error
      );

      throw new Error(
        `BROWSER_ERROR: ${error.message}`
      );
    }
  }

  // =========================================================
  // URL VALIDATION
  // =========================================================

  _validateGroupUrl(groupUrl) {

    if (
      !groupUrl ||
      typeof groupUrl !== 'string'
    ) {

      throw new Error(
        'GROUP_URL_ERROR: groupUrl is empty'
      );
    }

    let url;

    try {

      url =
        new URL(groupUrl);

    } catch {

      throw new Error(
        `GROUP_URL_ERROR: Invalid URL: ${groupUrl}`
      );
    }

    const hostname =
      url.hostname.toLowerCase();

    const validHost =
      hostname === 'facebook.com' ||
      hostname === 'www.facebook.com' ||
      hostname.endsWith(
        '.facebook.com'
      );

    if (!validHost) {

      throw new Error(
        `GROUP_URL_ERROR: Not a Facebook URL: ${groupUrl}`
      );
    }

    if (
      !url.pathname.includes(
        '/groups/'
      )
    ) {

      throw new Error(
        `GROUP_URL_ERROR: URL does not look like a Facebook group URL: ${groupUrl}`
      );
    }

    return url.toString();
  }

  // =========================================================
  // COOKIE NORMALIZATION
  // =========================================================

  _normalizeCookies(rawCookies) {

    this._log(
      `🍪 Cookie input type: ${
        Array.isArray(rawCookies)
          ? 'ARRAY'
          : rawCookies === null
            ? 'NULL'
            : typeof rawCookies
      }`
    );

    // -------------------------------------------------------
    // NULL
    // -------------------------------------------------------

    if (rawCookies === null) {

      throw new Error(
        'COOKIE_ERROR: rawCookies is NULL. No cookie data was provided by the worker.'
      );
    }

    // -------------------------------------------------------
    // UNDEFINED
    // -------------------------------------------------------

    if (
      rawCookies === undefined
    ) {

      throw new Error(
        'COOKIE_ERROR: rawCookies is UNDEFINED. Check the caller of FacebookService.'
      );
    }

    // -------------------------------------------------------
    // NOT ARRAY
    // -------------------------------------------------------

    if (
      !Array.isArray(rawCookies)
    ) {

      throw new Error(
        `COOKIE_ERROR: Cookies are not an array. Received type: ${typeof rawCookies}`
      );
    }

    this._log(
      `🍪 Raw cookie count: ${rawCookies.length}`
    );

    // -------------------------------------------------------
    // EMPTY
    // -------------------------------------------------------

    if (
      rawCookies.length === 0
    ) {

      throw new Error(
        'COOKIE_ERROR: Cookie array is EMPTY. The selected MongoDB account contains no cookies.'
      );
    }

    const normalized = [];

    for (
      const cookie
      of rawCookies
    ) {

      if (!cookie) {

        this._warn(
          '⚠️ Ignoring null/undefined cookie'
        );

        continue;
      }

      if (!cookie.name) {

        this._warn(
          '⚠️ Ignoring cookie without name'
        );

        continue;
      }

      if (
        cookie.value === undefined ||
        cookie.value === null
      ) {

        this._warn(
          `⚠️ Ignoring cookie "${cookie.name}" without value`
        );

        continue;
      }

      const item = {

        name:
          String(cookie.name),

        value:
          String(cookie.value),

        domain:
          cookie.domain ||
          '.facebook.com',

        path:
          cookie.path ||
          '/',

        secure:
          cookie.secure !== false,

        httpOnly:
          Boolean(
            cookie.httpOnly
          )
      };

      if (
        cookie.sameSite
      ) {

        const sameSite =
          String(
            cookie.sameSite
          ).toLowerCase();

        if (
          [
            'strict',
            'lax',
            'none'
          ].includes(
            sameSite
          )
        ) {

          item.sameSite =
            sameSite
              .charAt(0)
              .toUpperCase() +
            sameSite.slice(1);
        }
      }

      if (
        cookie.expires !== undefined &&
        cookie.expires !== null &&
        Number(cookie.expires) > 0
      ) {

        item.expires =
          Number(cookie.expires);
      }

      normalized.push(
        item
      );
    }

    // -------------------------------------------------------
    // NO VALID COOKIES
    // -------------------------------------------------------

    if (
      normalized.length === 0
    ) {

      throw new Error(
        'COOKIE_ERROR: No valid cookies after normalization.'
      );
    }

    // -------------------------------------------------------
    // Names only
    // NEVER print cookie values
    // -------------------------------------------------------

    const names =
      normalized.map(
        cookie => cookie.name
      );

    this._log(
      `🍪 Valid cookies after normalization: ${normalized.length}`
    );

    this._log(
      `🍪 Cookie names: ${names.join(', ')}`
    );

    // -------------------------------------------------------
    // Required Facebook cookies
    // -------------------------------------------------------

    const required = [
      'datr',
      'fr',
      'c_user',
      'xs'
    ];

    const missing =
      required.filter(
        name =>
          !normalized.some(
            cookie =>
              cookie.name === name &&
              cookie.value
          )
      );

    if (
      missing.length > 0
    ) {

      this._warn(
        `⚠️ Missing important Facebook cookies: ${missing.join(', ')}`
      );

    } else {

      this._log(
        '✅ Required Facebook cookies are present'
      );
    }

    return normalized;
  }

  // =========================================================
  // COOKIE DIAGNOSTICS AFTER SET
  // =========================================================

  async _inspectBrowserCookies(page) {

    try {

      const cookies =
        await page.cookies(
          'https://www.facebook.com/'
        );

      const names =
        cookies.map(
          cookie => cookie.name
        );

      const required = [
        'datr',
        'fr',
        'c_user',
        'xs'
      ];

      const missing =
        required.filter(
          name =>
            !names.includes(name)
        );

      const info = {
        total: cookies.length,
        names,
        missing
      };

      this._debug(
        'BROWSER COOKIE INSPECTION',
        info
      );

      this._log(
        `🍪 Chromium currently has ${cookies.length} Facebook cookie(s)`
      );

      if (
        missing.length > 0
      ) {

        this._warn(
          `⚠️ Required cookies missing inside Chromium: ${missing.join(', ')}`
        );

      } else {

        this._log(
          '✅ Required cookies are present inside Chromium'
        );
      }

      return info;

    } catch (error) {

      this._error(
        'COOKIE_INSPECTION',
        error
      );

      return null;
    }
  }

  // =========================================================
  // CREATE PAGE
  // =========================================================

  async _createCleanPage(
    browser,
    rawCookies
  ) {

    if (
      !browser ||
      !browser.isConnected()
    ) {

      throw new Error(
        'BROWSER_ERROR: Browser is not connected'
      );
    }

    let page;

    try {

      page =
        await browser.newPage();

      page.setDefaultNavigationTimeout(
        this.navigationTimeout
      );

      page.setDefaultTimeout(
        this.actionTimeout
      );

      // -----------------------------------------------------
      // User agent
      // -----------------------------------------------------

      await page.setUserAgent(
        'Mozilla/5.0 (X11; Linux x86_64) ' +
        'AppleWebKit/537.36 (KHTML, like Gecko) ' +
        'Chrome/131.0.0.0 Safari/537.36'
      );

      // -----------------------------------------------------
      // Request interception
      // -----------------------------------------------------

      await page.setRequestInterception(
        true
      );

      page.on(
        'request',
        request => {

          try {

            if (
              typeof request.isInterceptResolutionHandled ===
              'function' &&
              request.isInterceptResolutionHandled()
            ) {
              return;
            }

            const type =
              request.resourceType();

            if (
              [
                'image',
                'media',
                'font'
              ].includes(type)
            ) {

              request.abort();

            } else {

              request.continue();
            }

          } catch (error) {

            this._debug(
              'Request interception warning',
              error.message
            );
          }
        }
      );

      // -----------------------------------------------------
      // Dialog
      // -----------------------------------------------------

      page.on(
        'dialog',
        async dialog => {

          try {
            await dialog.dismiss();
          } catch {}
        }
      );

      // -----------------------------------------------------
      // Page errors
      // -----------------------------------------------------

      page.on(
        'pageerror',
        error => {

          this._debug(
            'Browser page error',
            error.message
          );
        }
      );

      // -----------------------------------------------------
      // Console
      // -----------------------------------------------------

      if (this.debug) {

        page.on(
          'console',
          message => {

            const text =
              message.text();

            if (text) {

              console.log(
                `[FACEBOOK][PAGE] ${text}`
              );
            }
          }
        );
      }

      // -----------------------------------------------------
      // Cookies
      // -----------------------------------------------------

      const cookies =
        this._normalizeCookies(
          rawCookies
        );

      try {

        this._log(
          `🍪 Installing ${cookies.length} cookies into Chromium...`
        );

        await page.setCookie(
          ...cookies
        );

        this._log(
          '✅ Cookies successfully passed to Chromium'
        );

      } catch (error) {

        this._error(
          'COOKIE',
          error
        );

        throw new Error(
          `COOKIE_ERROR: Failed to set cookies in Chromium: ${error.message}`
        );
      }

      // -----------------------------------------------------
      // Verify cookies
      // -----------------------------------------------------

      await this._inspectBrowserCookies(
        page
      );

      return page;

    } catch (error) {

      if (
        error.message?.startsWith(
          'COOKIE_ERROR:'
        ) ||
        error.message?.startsWith(
          'BROWSER_ERROR:'
        )
      ) {

        throw error;
      }

      throw new Error(
        `PAGE_ERROR: ${error.message}`
      );
    }
  }

  // =========================================================
  // PAGE DIAGNOSTICS
  // =========================================================

  async _inspectFacebookPage(page) {

    try {

      const info =
        await page.evaluate(() => {

          const body =
            document.body;

          const text =
            body?.innerText || '';

          const lower =
            text.toLowerCase();

          const url =
            location.href.toLowerCase();

          return {

            url:
              location.href,

            title:
              document.title,

            bodyLength:
              text.length,

            bodyPreview:
              text
                .replace(/\s+/g, ' ')
                .slice(0, 2500),

            links:
              document.querySelectorAll(
                'a[href]'
              ).length,

            articles:
              document.querySelectorAll(
                'article'
              ).length,

            roleArticles:
              document.querySelectorAll(
                '[role="article"]'
              ).length,

            textAreas:
              document.querySelectorAll(
                'textarea'
              ).length,

            loginUrlDetected:
              url.includes('/login') ||
              url.includes('/checkpoint'),

            loginTextDetected:
              lower.includes(
                'log into facebook'
              ) ||
              lower.includes(
                'log in to facebook'
              ) ||
              lower.includes(
                'you must log in'
              ) ||
              lower.includes(
                'تسجيل الدخول إلى فيسبوك'
              ),

            checkpointDetected:
              url.includes(
                '/checkpoint'
              ) ||
              lower.includes(
                'checkpoint'
              ) ||
              lower.includes(
                'security check'
              ) ||
              lower.includes(
                'confirm your identity'
              ) ||
              lower.includes(
                'تأكيد هويتك'
              ),

            blockedDetected:
              lower.includes(
                'content isn’t available'
              ) ||
              lower.includes(
                "content isn't available"
              ) ||
              lower.includes(
                'this content is not available'
              ) ||
              lower.includes(
                'المحتوى غير متاح'
              ),

            facebookDetected:
              url.includes(
                'facebook.com'
              )
          };
        });

      this._debug(
        'PAGE INSPECTION',
        info
      );

      return info;

    } catch (error) {

      this._error(
        'PAGE_INSPECTION',
        error
      );

      return null;
    }
  }

  // =========================================================
  // AUTHENTICATION CHECK
  // =========================================================

  async _checkFacebookAuthentication(
    page
  ) {

    const info =
      await this._inspectFacebookPage(
        page
      );

    if (!info) {

      throw new Error(
        'AUTHENTICATION_ERROR: Could not inspect Facebook page'
      );
    }

    if (
      info.checkpointDetected
    ) {

      throw new Error(
        'AUTHENTICATION_ERROR: Facebook checkpoint/security verification detected.'
      );
    }

    if (
      info.loginUrlDetected
    ) {

      throw new Error(
        'AUTHENTICATION_ERROR: Facebook redirected to login/checkpoint. Cookies are probably expired, invalid, or rejected.'
      );
    }

    if (
      info.loginTextDetected &&
      !info.url.includes('/groups/')
    ) {

      throw new Error(
        'AUTHENTICATION_ERROR: Facebook login text detected. Cookies may be invalid or expired.'
      );
    }

    if (
      info.blockedDetected
    ) {

      throw new Error(
        'GROUP_ACCESS_ERROR: Facebook reports that the requested content is unavailable.'
      );
    }

    return info;
  }

  // =========================================================
  // NORMALIZE POST URL
  // =========================================================

  _normalizePostUrl(href) {

    try {

      const url =
        new URL(href);

      const hostname =
        url.hostname.toLowerCase();

      if (
        hostname !== 'facebook.com' &&
        hostname !== 'www.facebook.com'
      ) {

        return null;
      }

      const path =
        url.pathname;

      // -----------------------------------------------------
      // GROUP PERMALINK
      // -----------------------------------------------------

      const permalinkMatch =
        path.match(
          /^\/groups\/([^/]+)\/permalink\/(\d+)\/?/i
        );

      if (permalinkMatch) {

        return (
          `https://www.facebook.com/groups/${permalinkMatch[1]}/permalink/${permalinkMatch[2]}/`
        );
      }

      // -----------------------------------------------------
      // GROUP POSTS
      // -----------------------------------------------------

      const postsMatch =
        path.match(
          /^\/groups\/([^/]+)\/posts\/(\d+)\/?/i
        );

      if (postsMatch) {

        return (
          `https://www.facebook.com/groups/${postsMatch[1]}/posts/${postsMatch[2]}/`
        );
      }

      // -----------------------------------------------------
      // STORY.PHP
      // -----------------------------------------------------

      if (
        path === '/story.php'
      ) {

        const storyId =
          url.searchParams.get(
            'story_fbid'
          );

        if (storyId) {

          return (
            `https://www.facebook.com/story.php?story_fbid=${encodeURIComponent(storyId)}`
          );
        }
      }

      return null;

    } catch {

      return null;
    }
  }

  // =========================================================
  // EXTRACT POST LINKS
  // =========================================================

  async _extractPostLinks(page) {

    const fromAnchors =
      await page.evaluate(() => {

        const results =
          new Set();

        const anchors =
          document.querySelectorAll(
            'a[href]'
          );

        for (
          const anchor
          of anchors
        ) {

          const href =
            anchor.href;

          if (!href) {
            continue;
          }

          results.add(href);
        }

        return [
          ...results
        ];
      });

    const normalized =
      new Set();

    // -------------------------------------------------------
    // Anchors
    // -------------------------------------------------------

    for (
      const href
      of fromAnchors
    ) {

      const normalizedUrl =
        this._normalizePostUrl(
          href
        );

      if (normalizedUrl) {

        normalized.add(
          normalizedUrl
        );
      }
    }

    // -------------------------------------------------------
    // Raw HTML
    // -------------------------------------------------------

    try {

      const html =
        await page.content();

      const regex =
        /(?:https?:\/\/(?:www\.)?facebook\.com)?\/groups\/[^"'\\<>\s]+\/permalink\/\d+\/?/gi;

      const matches =
        html.match(regex) || [];

      for (
        const match
        of matches
      ) {

        let candidate =
          match;

        if (
          candidate.startsWith('/')
        ) {

          candidate =
            `https://www.facebook.com${candidate}`;
        }

        const normalizedUrl =
          this._normalizePostUrl(
            candidate
          );

        if (normalizedUrl) {

          normalized.add(
            normalizedUrl
          );
        }
      }

    } catch (error) {

      this._debug(
        'HTML extraction warning',
        error.message
      );
    }

    return [
      ...normalized
    ];
  }

  // =========================================================
  // SAVE DEBUG SCREENSHOT
  // =========================================================

  async _saveDebugScreenshot(
    page,
    name = 'facebook-debug'
  ) {

    if (
      !this.debugScreenshot
    ) {
      return;
    }

    try {

      const safeName =
        String(name)
          .replace(
            /[^a-zA-Z0-9_-]/g,
            '_'
          );

      const path =
        `/tmp/${safeName}.png`;

      await page.screenshot({
        path,
        fullPage: true
      });

      this._log(
        `📸 Debug screenshot saved: ${path}`
      );

    } catch (error) {

      this._debug(
        'Screenshot failed',
        error.message
      );
    }
  }

  // =========================================================
  // DISCOVER POSTS
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

          // -------------------------------------------------
          // Validate URL FIRST
          // -------------------------------------------------

          const validGroupUrl =
            this._validateGroupUrl(
              groupUrl
            );

          this._log(
            `🌐 Target group: ${validGroupUrl}`
          );

          // -------------------------------------------------
          // Validate cookies BEFORE Chrome
          // -------------------------------------------------

          const cookies =
            this._normalizeCookies(
              rawCookies
            );

          this._log(
            `🍪 Cookie validation passed: ${cookies.length} cookies`
          );

          // -------------------------------------------------
          // Browser
          // -------------------------------------------------

          browser =
            await this._launchBrowser();

          page =
            await this._createCleanPage(
              browser,
              cookies
            );

          // -------------------------------------------------
          // Navigate
          // -------------------------------------------------

          this._log(
            `🌐 Navigating to: ${validGroupUrl}`
          );

          let response = null;

          try {

            response =
              await page.goto(
                validGroupUrl,
                {
                  waitUntil:
                    'domcontentloaded',
                  timeout:
                    this.navigationTimeout
                }
              );

          } catch (error) {

            this._error(
              'NAVIGATION',
              error
            );

            await this._saveDebugScreenshot(
              page,
              'facebook-navigation-error'
            );

            throw new Error(
              `NAVIGATION_ERROR: ${error.message}`
            );
          }

          // -------------------------------------------------
          // HTTP
          // -------------------------------------------------

          if (response) {

            const status =
              response.status();

            this._log(
              `🌐 HTTP status: ${status}`
            );

            if (
              status >= 400
            ) {

              await this._saveDebugScreenshot(
                page,
                `facebook-http-${status}`
              );

              throw new Error(
                `GROUP_ACCESS_ERROR: Facebook returned HTTP ${status}`
              );
            }
          }

          // -------------------------------------------------
          // Wait
          // -------------------------------------------------

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                5000
              )
          );

          // -------------------------------------------------
          // Browser cookie inspection
          // -------------------------------------------------

          await this._inspectBrowserCookies(
            page
          );

          // -------------------------------------------------
          // Authentication
          // -------------------------------------------------

          const pageInfo =
            await this._checkFacebookAuthentication(
              page
            );

          this._log(
            `📍 Current URL: ${pageInfo.url}`
          );

          this._log(
            `📄 Page title: ${pageInfo.title}`
          );

          // -------------------------------------------------
          // Redirect check
          // -------------------------------------------------

          if (
            !pageInfo.url.includes(
              '/groups/'
            )
          ) {

            await this._saveDebugScreenshot(
              page,
              'facebook-redirected'
            );

            throw new Error(
              `GROUP_ACCESS_ERROR: Facebook redirected away from group. Current URL: ${pageInfo.url}`
            );
          }

          // -------------------------------------------------
          // Scroll
          // -------------------------------------------------

          this._log(
            '📜 Loading group feed...'
          );

          for (
            let i = 0;
            i < 6;
            i++
          ) {

            await page.evaluate(
              () => {
                window.scrollBy(
                  0,
                  1000
                );
              }
            );

            await new Promise(
              resolve =>
                setTimeout(
                  resolve,
                  1500
                )
            );

            this._debug(
              `Scroll ${i + 1}/6 completed`
            );
          }

          // -------------------------------------------------
          // Extract
          // -------------------------------------------------

          const posts =
            await this._extractPostLinks(
              page
            );

          this._log(
            `🔎 Total posts found: ${posts.length}`
          );

          if (
            posts.length > 0
          ) {

            posts.forEach(
              (post, index) => {

                this._log(
                  `📌 Post ${index + 1}: ${post}`
                );
              }
            );

            return posts;
          }

          // -------------------------------------------------
          // ZERO POSTS
          // -------------------------------------------------

          this._warn(
            '⚠️ Facebook loaded but ZERO supported post URLs were detected.'
          );

          const finalInfo =
            await this._inspectFacebookPage(
              page
            );

          await this._saveDebugScreenshot(
            page,
            'facebook-zero-posts'
          );

          console.log(
            '\n========== FACEBOOK DISCOVERY DEBUG =========='
          );

          console.log(
            `URL: ${finalInfo?.url || 'UNKNOWN'}`
          );

          console.log(
            `TITLE: ${finalInfo?.title || 'UNKNOWN'}`
          );

          console.log(
            `BODY LENGTH: ${finalInfo?.bodyLength || 0}`
          );

          console.log(
            `LINKS: ${finalInfo?.links || 0}`
          );

          console.log(
            `ARTICLES: ${finalInfo?.articles || 0}`
          );

          console.log(
            `ROLE ARTICLES: ${finalInfo?.roleArticles || 0}`
          );

          console.log(
            `TEXTAREAS: ${finalInfo?.textAreas || 0}`
          );

          console.log(
            `LOGIN URL: ${finalInfo?.loginUrlDetected}`
          );

          console.log(
            `LOGIN TEXT: ${finalInfo?.loginTextDetected}`
          );

          console.log(
            `CHECKPOINT: ${finalInfo?.checkpointDetected}`
          );

          console.log(
            `BLOCKED: ${finalInfo?.blockedDetected}`
          );

          console.log(
            'BODY PREVIEW:'
          );

          console.log(
            finalInfo?.bodyPreview ||
            '[EMPTY]'
          );

          console.log(
            '===============================================\n'
          );

          if (
            finalInfo?.loginUrlDetected ||
            finalInfo?.loginTextDetected
          ) {

            throw new Error(
              'AUTHENTICATION_ERROR: Facebook login detected after navigation. Cookies are probably expired, invalid, incomplete, or rejected.'
            );
          }

          if (
            finalInfo?.checkpointDetected
          ) {

            throw new Error(
              'AUTHENTICATION_ERROR: Facebook checkpoint/security verification detected.'
            );
          }

          if (
            finalInfo?.blockedDetected
          ) {

            throw new Error(
              'GROUP_ACCESS_ERROR: Facebook reports that the group/content is unavailable for this account.'
            );
          }

          throw new Error(
            'POST_DISCOVERY_ERROR: Group loaded successfully, but no supported /permalink/ or /posts/ URLs were detected.'
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
      'discoverPendingPosts'
    );
  }

  // =========================================================
  // FETCH POST TEXT
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

          const normalizedPost =
            this._normalizePostUrl(
              postUrl
            );

          if (!normalizedPost) {

            throw new Error(
              `POST_URL_ERROR: Invalid Facebook post URL: ${postUrl}`
            );
          }

          this._log(
            `📖 Reading post: ${normalizedPost}`
          );

          const cookies =
            this._normalizeCookies(
              rawCookies
            );

          browser =
            await this._launchBrowser();

          page =
            await this._createCleanPage(
              browser,
              cookies
            );

          try {

            await page.goto(
              normalizedPost,
              {
                waitUntil:
                  'domcontentloaded',
                timeout:
                  this.navigationTimeout
              }
            );

          } catch (error) {

            await this._saveDebugScreenshot(
              page,
              'facebook-post-navigation-error'
            );

            throw new Error(
              `POST_NAVIGATION_ERROR: ${error.message}`
            );
          }

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                3000
              )
          );

          const info =
            await this._inspectFacebookPage(
              page
            );

          if (
            info?.checkpointDetected
          ) {

            throw new Error(
              'AUTHENTICATION_ERROR: Facebook checkpoint detected while opening post.'
            );
          }

          if (
            info?.loginUrlDetected ||
            (
              info?.loginTextDetected &&
              !info.url.includes('/groups/')
            )
          ) {

            throw new Error(
              'AUTHENTICATION_ERROR: Facebook requires login while opening the post.'
            );
          }

          const postText =
            await page.evaluate(
              () => {

                const candidates =
                  [];

                const selectors = [
                  '[role="article"]',
                  'article',
                  '[data-pagelet*="FeedUnit"]'
                ];

                for (
                  const selector
                  of selectors
                ) {

                  const elements =
                    document.querySelectorAll(
                      selector
                    );

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

                      candidates.push(
                        text
                      );
                    }
                  }
                }

                if (
                  candidates.length === 0
                ) {

                  const elements =
                    document.querySelectorAll(
                      'p, div'
                    );

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
                      text.length >= 40
                    ) {

                      candidates.push(
                        text
                      );
                    }
                  }
                }

                candidates.sort(
                  (a, b) =>
                    b.length -
                    a.length
                );

                return (
                  candidates[0] || ''
                );
              }
            );

          if (
            !postText
          ) {

            await this._saveDebugScreenshot(
              page,
              'facebook-empty-post-text'
            );

            throw new Error(
              'POST_TEXT_ERROR: Post page opened but no post text could be extracted.'
            );
          }

          this._log(
            `📄 Extracted post text: ${postText.length} characters`
          );

          return postText;

        } catch (error) {

          this._error(
            'FETCH_POST',
            error
          );

          throw error;

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
  // SUBMIT DUAL COMMENTS
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

          const normalizedPost =
            this._normalizePostUrl(
              postUrl
            );

          if (!normalizedPost) {

            throw new Error(
              `POST_URL_ERROR: Invalid Facebook post URL: ${postUrl}`
            );
          }

          if (
            !aiComment ||
            !String(aiComment).trim()
          ) {

            throw new Error(
              'COMMENT_ERROR: AI comment is empty'
            );
          }

          if (
            !hashtag ||
            !String(hashtag).trim()
          ) {

            throw new Error(
              'COMMENT_ERROR: Hashtag is empty'
            );
          }

          this._log(
            `💬 Opening post for commenting: ${normalizedPost}`
          );

          const cookies =
            this._normalizeCookies(
              rawCookies
            );

          browser =
            await this._launchBrowser();

          page =
            await this._createCleanPage(
              browser,
              cookies
            );

          try {

            await page.goto(
              normalizedPost,
              {
                waitUntil:
                  'domcontentloaded',
                timeout:
                  this.navigationTimeout
              }
            );

          } catch (error) {

            await this._saveDebugScreenshot(
              page,
              'facebook-comment-navigation-error'
            );

            throw new Error(
              `POST_NAVIGATION_ERROR: ${error.message}`
            );
          }

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                3000
              )
          );

          const pageInfo =
            await this._inspectFacebookPage(
              page
            );

          if (
            pageInfo?.checkpointDetected
          ) {

            throw new Error(
              'AUTHENTICATION_ERROR: Facebook checkpoint detected before commenting.'
            );
          }

          if (
            pageInfo?.loginUrlDetected ||
            (
              pageInfo?.loginTextDetected &&
              !pageInfo.url.includes('/groups/')
            )
          ) {

            throw new Error(
              'AUTHENTICATION_ERROR: Facebook requires login before commenting.'
            );
          }

          const selector =
            'textarea[name="comment_text"], textarea';

          const submitButton =
            'input[type="submit"][name="post"], input[type="submit"]';

          // -------------------------------------------------
          // FIRST COMMENT
          // -------------------------------------------------

          try {

            await page.waitForSelector(
              selector,
              {
                timeout: 15000
              }
            );

          } catch {

            await this._saveDebugScreenshot(
              page,
              'facebook-comment-box-missing'
            );

            throw new Error(
              'COMMENT_BOX_ERROR: Facebook post loaded but comment textarea was not found.'
            );
          }

          this._log(
            '💬 Writing AI comment...'
          );

          await page.click(
            selector
          );

          await page.type(
            selector,
            String(
              aiComment
            ).trim(),
            {
              delay: 15
            }
          );

          await page.waitForSelector(
            submitButton,
            {
              timeout: 10000
            }
          );

          await page.click(
            submitButton
          );

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                5000
              )
          );

          this._log(
            '✅ AI comment submitted'
          );

          // -------------------------------------------------
          // HASHTAG
          // -------------------------------------------------

          this._log(
            '🏷️ Preparing hashtag comment...'
          );

          try {

            await page.waitForSelector(
              selector,
              {
                timeout: 10000
              }
            );

          } catch {

            this._log(
              '🔄 Comment box disappeared. Reloading post...'
            );

            await page.goto(
              normalizedPost,
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
                  3000
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
            String(
              hashtag
            ).trim(),
            {
              delay: 15
            }
          );

          await page.waitForSelector(
            submitButton,
            {
              timeout: 10000
            }
          );

          await page.click(
            submitButton
          );

          await new Promise(
            resolve =>
              setTimeout(
                resolve,
                5000
              )
            );

          this._log(
            '🏷️ Hashtag comment submitted'
          );

          return true;

        } catch (error) {

          this._error(
            'COMMENT',
            error
          );

          throw error;

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

  // =========================================================
  // SAFE CLOSE
  // =========================================================

  async _closePage(page) {

    if (!page) {
      return;
    }

    try {

      if (!page.isClosed()) {
        await page.close();
      }

    } catch {}
  }

  async _closeBrowser(browser) {

    if (!browser) {
      return;
    }

    try {

      if (browser.isConnected()) {
        await browser.close();
      }

    } catch {}
  }

  // =========================================================
  // RETRY
  // =========================================================

  async _withRetry(
    operation,
    operationName
  ) {

    let lastError = null;

    for (
      let attempt = 1;
      attempt <= this.maxRetries;
      attempt++
    ) {

      try {

        this._log(
          `🔄 ${operationName} - attempt ${attempt}/${this.maxRetries}`
        );

        return await operation();

      } catch (error) {

        lastError = error;

        this._error(
          operationName,
          error
        );

        const message =
          String(
            error?.message || ''
          );

        // ---------------------------------------------------
        // Errors that retrying cannot fix
        // ---------------------------------------------------

        const noRetry =
          message.includes(
            'GROUP_URL_ERROR'
          ) ||
          message.includes(
            'COOKIE_ERROR'
          ) ||
          message.includes(
            'AUTHENTICATION_ERROR'
          ) ||
          message.includes(
            'GROUP_ACCESS_ERROR'
          ) ||
          message.includes(
            'POST_URL_ERROR'
          ) ||
          message.includes(
            'COMMENT_ERROR'
          );

        if (
          noRetry ||
          attempt >= this.maxRetries
        ) {

          break;
        }

        const delay =
          attempt * 3000;

        this._log(
          `⏳ Retrying in ${delay}ms...`
        );

        await new Promise(
          resolve =>
            setTimeout(
              resolve,
              delay
            )
        );
      }
    }

    throw lastError;
  }
}

module.exports =
  new FacebookService();