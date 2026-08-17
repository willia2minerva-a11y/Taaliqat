const puppeteer = require('puppeteer');

class FacebookService {
  constructor() {
    this.navigationTimeout = 60000;
    this.actionTimeout = 20000;
    this.maxRetries = 2;

    this.debug = String(process.env.FACEBOOK_DEBUG || '').toLowerCase() === 'true';
    this.debugScreenshot = String(process.env.FACEBOOK_DEBUG_SCREENSHOT || '').toLowerCase() === 'true';
  }

  _log(msg) {
    console.log(`[FACEBOOK] ${msg}`);
  }

  _warn(msg) {
    console.warn(`[FACEBOOK][WARN] ${msg}`);
  }

  _error(stage, err) {
    console.error(`[FACEBOOK][${stage}] ${err?.message || err}`);
  }

  _debug(msg, data) {
    if (!this.debug) return;
    console.log(`[FACEBOOK][DEBUG] ${msg}`, data === undefined ? '' : data);
  }

  // =========================================================
  // COOKIES
  // =========================================================

  _normalizeCookies(input) {
    if (typeof input === 'string') {
      input = input
        .split(';')
        .map(x => x.trim())
        .filter(Boolean)
        .map(x => {
          const i = x.indexOf('=');
          if (i < 1) return null;
          return {
            name: x.slice(0, i).trim(),
            value: x.slice(i + 1).trim()
          };
        })
        .filter(Boolean);
    }

    if (!Array.isArray(input) || !input.length) {
      throw new Error('COOKIE_ERROR: Cookie array/string is empty');
    }

    const cookies = input
      .filter(c => c && c.name && c.value !== undefined)
      .map(c => ({
        name: String(c.name),
        value: String(c.value),
        domain: c.domain || '.facebook.com',
        path: c.path || '/',
        secure: c.secure !== false,
        httpOnly: Boolean(c.httpOnly),
        ...(c.sameSite ? { sameSite: c.sameSite } : {}),
        ...(Number(c.expires) > 0 ? { expires: Number(c.expires) } : {})
      }));

    if (!cookies.length) {
      throw new Error('COOKIE_ERROR: No valid cookies');
    }

    const names = cookies.map(c => c.name);
    this._log(`🍪 Cookies prepared: ${cookies.length} | ${names.join(', ')}`);

    const required = ['datr', 'c_user', 'xs', 'fr'];
    const missing = required.filter(x => !names.includes(x));

    if (missing.length) {
      throw new Error(`COOKIE_ERROR: Missing required cookies: ${missing.join(', ')}`);
    }

    return cookies;
  }

  // =========================================================
  // BROWSER
  // =========================================================

  async _launchBrowser() {
    this._log('🔍 Launching Chromium...');

    try {
      const browser = await puppeteer.launch({
        headless: 'new',
        timeout: 120000,
        protocolTimeout: 120000,
        dumpio: this.debug,
        pipe: true,
        args: [
          '--no-sandbox',
          '--disable-setuid-sandbox',
          '--disable-dev-shm-usage',
          '--disable-gpu',
          '--disable-software-rasterizer',
          '--disable-extensions',
          '--disable-sync',
          '--disable-notifications',
          '--disable-popup-blocking',
          '--no-first-run',
          '--no-default-browser-check',
          '--disable-blink-features=AutomationControlled',
          '--disable-features=IsolateOrigins,site-per-process',
          '--disable-background-timer-throttling',
          '--disable-backgrounding-occluded-windows',
          '--disable-renderer-backgrounding'
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

      if (!browser.isConnected()) {
        throw new Error('Chromium is not connected');
      }

      browser.on('disconnected', () => this._warn('⚠️ Chromium disconnected'));

      this._log('✅ Chromium launched');
      return browser;

    } catch (err) {
      this._error('BROWSER', err);
      throw new Error(`BROWSER_ERROR: ${err.message}`);
    }
  }

  // =========================================================
  // PAGE
  // =========================================================

  async _createPage(browser, rawCookies) {
    if (!browser?.isConnected()) {
      throw new Error('BROWSER_ERROR: Browser is disconnected');
    }

    const inputCount = Array.isArray(rawCookies) ? rawCookies.length : (typeof rawCookies === 'string' ? 'string' : 'unknown');
    this._log(`🍪 _createPage INPUT: ${inputCount}`);

    const page = await browser.newPage();
    page.setDefaultNavigationTimeout(this.navigationTimeout);
    page.setDefaultTimeout(this.actionTimeout);

    await page.setUserAgent(
      'Mozilla/5.0 (X11; Linux x86_64) AppleWebKit/537.36 ' +
      '(KHTML, like Gecko) Chrome/131.0.0.0 Safari/537.36'
    );

    const cookies = this._normalizeCookies(rawCookies);

    try {
      await page.setCookie(...cookies);
      this._log(`🍪 Loaded ${cookies.length} cookies into Puppeteer (on about:blank)`);
    } catch (err) {
      throw new Error(`COOKIE_ERROR: Failed to set cookies: ${err.message}`);
    }

    await page.setRequestInterception(true);

    page.on('request', req => {
      try {
        if (req.isInterceptResolutionHandled?.()) return;
        req.continue();
      } catch {}
    });

    page.on('requestfailed', req => {
      const failure = req.failure();
      console.log(
        `[FACEBOOK][REQUEST_FAILED]`,
        JSON.stringify({
          type: req.resourceType(),
          method: req.method(),
          error: failure?.errorText || 'UNKNOWN',
          url: req.url().substring(0, 300)
        })
      );
    });

    page.on('response', response => {
      const status = response.status();
      if (status >= 400) {
        console.log(
          `[FACEBOOK][HTTP_ERROR] ${status} | ${response.url().substring(0, 300)}`
        );
      }
    });

    page.on('pageerror', err => this._debug('Page error:', err.message));

    if (this.debug) {
      page.on('console', msg => this._debug('PAGE:', msg.text()));
    }

    return page;
  }

  // =========================================================
  // PAGE INFO
  // =========================================================

  async _pageInfo(page) {
    return page.evaluate(() => {
      const text = document.body?.innerText || '';
      const t = text.toLowerCase();

      return {
        url: location.href,
        title: document.title,
        text: text.replace(/\s+/g, ' ').slice(0, 2500),
        links: document.querySelectorAll('a[href]').length,
        articles: document.querySelectorAll('article,[role="article"]').length,
        login: t.includes('log in') || t.includes('login') || t.includes('تسجيل الدخول'),
        checkpoint: t.includes('checkpoint') || t.includes('security check') || t.includes('تأكيد هويتك'),
        blocked: t.includes("content isn't available") || t.includes('المحتوى غير متاح')
      };
    });
  }

  async _checkAccess(page) {
    const info = await this._pageInfo(page);

    this._log(`📍 URL: ${info.url}`);
    this._log(`📄 TITLE: ${info.title}`);

    if (info.checkpoint) {
      throw new Error('AUTHENTICATION_ERROR: Facebook security checkpoint detected');
    }

    if (info.login && !info.url.includes('/groups/')) {
      throw new Error('AUTHENTICATION_ERROR: Facebook requires login. Cookies may be expired');
    }

    if (info.blocked) {
      throw new Error('GROUP_ACCESS_ERROR: Facebook says this content is unavailable');
    }

    return info;
  }

  // =========================================================
  // URL
  // =========================================================

  _groupUrl(url) {
    try {
      const u = new URL(url);
      if (!u.hostname.toLowerCase().includes('facebook.com')) {
        throw new Error('Invalid Facebook URL');
      }
      return `https://www.facebook.com${u.pathname}${u.search}`;
    } catch {
      throw new Error(`GROUP_URL_ERROR: Invalid group URL: ${url}`);
    }
  }

  // ✅ تحسين استخراج الروابط لدعم /permalink/ و /posts/
  _extractPostUrl(href) {
    try {
      const u = new URL(href);
      if (!u.hostname.toLowerCase().includes('facebook.com')) return null;

      // مطابقة /groups/{group}/permalink/{id}/
      let m = u.pathname.match(/^\/groups\/([^/]+)\/permalink\/(\d+)\/?/i);
      if (m) {
        return `https://www.facebook.com/groups/${m[1]}/permalink/${m[2]}/`;
      }

      // مطابقة /groups/{group}/posts/{id}/
      m = u.pathname.match(/^\/groups\/([^/]+)\/posts\/(\d+)\/?/i);
      if (m) {
        return `https://www.facebook.com/groups/${m[1]}/posts/${m[2]}/`;
      }

      // مطابقة /story.php?story_fbid={id}
      if (u.pathname === '/story.php') {
        const id = u.searchParams.get('story_fbid');
        if (id) {
          return `https://www.facebook.com/story.php?story_fbid=${encodeURIComponent(id)}`;
        }
      }

      return null;
    } catch {
      return null;
    }
  }

  // =========================================================
  // DISCOVER POSTS (محسّن)
  // =========================================================

  async discoverPendingPosts(rawCookies, groupUrl) {
    this._log(`🍪 DISCOVERY INPUT: ${Array.isArray(rawCookies) ? rawCookies.length : typeof rawCookies}`);

    let browser = null;
    let page = null;

    try {
      const url = this._groupUrl(groupUrl);

      browser = await this._launchBrowser();
      page = await this._createPage(browser, rawCookies);

      this._log(`🌐 Navigating to: ${url}`);

      // ✅ استخدام domcontentloaded بدلاً من commit
      const response = await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      this._log(`🌐 Navigation response: ${response?.status() || 'NO_RESPONSE'}`);
      this._log(`🌐 Final URL: ${page.url()}`);
      this._log(`📄 Title: ${await page.title()}`);

      if (response && response.status() >= 400) {
        throw new Error(`GROUP_ACCESS_ERROR: HTTP ${response.status()}`);
      }

      // ✅ التحقق من الكوكيز بعد الانتقال
      const fbCookies = await page.cookies('https://www.facebook.com/');
      const fbCookieNames = fbCookies.map(c => c.name);
      this._log(`🔎 Facebook cookies after navigation: ${fbCookies.length} | ${fbCookieNames.join(', ')}`);

      const required = ['datr', 'c_user', 'xs', 'fr'];
      const missingAfterNav = required.filter(name => !fbCookieNames.includes(name));
      if (missingAfterNav.length) {
        this._warn(`⚠️ Required cookies missing AFTER navigation: ${missingAfterNav.join(', ')}`);
      } else {
        this._log(`✅ All required Facebook cookies are present after navigation`);
      }

      // ✅ انتظار تحميل المحتوى
      await page.waitForNetworkIdle({
        idleTime: 1500,
        timeout: 15000
      }).catch(() => {});

      await new Promise(r => setTimeout(r, 3000));

      // ✅ التحقق من حالة المصادقة
      const info = await this._pageInfo(page);
      console.log('\n========== FACEBOOK AUTH CHECK ==========');
      console.log('URL:', info.url);
      console.log('TITLE:', info.title);
      console.log('LOGIN:', info.login);
      console.log('CHECKPOINT:', info.checkpoint);
      console.log('BLOCKED:', info.blocked);
      console.log('=========================================\n');

      if (info.checkpoint) {
        throw new Error('AUTHENTICATION_ERROR: Facebook security checkpoint detected');
      }

      if (info.login && !info.url.includes('/groups/')) {
        throw new Error('AUTHENTICATION_ERROR: Facebook requires login. Cookies may be expired');
      }

      if (info.blocked) {
        throw new Error('GROUP_ACCESS_ERROR: Facebook says this content is unavailable');
      }

      // ✅ التمرير لتحميل المزيد
      for (let i = 0; i < 8; i++) {
        await page.evaluate(() => window.scrollBy(0, 1200));
        await new Promise(r => setTimeout(r, 1000));
      }

      // ✅ استخراج الروابط (محسّن)
      const postUrls = await page.evaluate(() => {
        const links = Array.from(document.querySelectorAll('a[href]'));
        
        return links
          .map(a => a.href)
          .filter(Boolean)
          .map(url => {
            try {
              return new URL(url, location.origin).href;
            } catch {
              return null;
            }
          })
          .filter(Boolean)
          .filter(url =>
            /facebook\.com\/groups\/[^/]+\/(permalink|posts)\/\d+/i.test(url)
          )
          .map(url => url.split('?')[0])
          .filter((url, index, arr) => arr.indexOf(url) === index);
      });

      this._log(`🔎 Post permalinks found: ${postUrls.length}`);

      // ✅ تحويل الروابط إلى الصيغة الموحدة
      const posts = new Set();
      for (const link of postUrls) {
        const p = this._extractPostUrl(link);
        if (p) posts.add(p);
      }

      // ✅ البحث في HTML الخام كخطة بديلة
      if (posts.size === 0) {
        this._log('🔍 No posts found in DOM, searching HTML...');
        const html = await page.content();
        const matches = html.match(/(?:https?:\/\/(?:www\.)?facebook\.com)?\/groups\/[^"'\\<>\s]+\/(?:permalink|posts)\/\d+\/?/gi) || [];

        for (let link of matches) {
          if (link.startsWith('/')) {
            link = `https://www.facebook.com${link}`;
          }
          const p = this._extractPostUrl(link);
          if (p) posts.add(p);
        }
      }

      const result = [...posts];
      this._log(`🔎 Total posts found: ${result.length}`);

      if (!result.length) {
        // ✅ طباعة معلومات إضافية للتشخيص
        const state = await page.evaluate(() => ({
          url: location.href,
          title: document.title,
          bodyLength: document.body?.innerText?.length || 0,
          links: document.querySelectorAll('a[href]').length,
          articles: document.querySelectorAll('article,[role="article"]').length,
          feed: document.querySelectorAll('[role="feed"]').length,
          main: document.querySelectorAll('main').length
        }));

        console.log('\n========== FACEBOOK PAGE STATE ==========');
        console.log(JSON.stringify(state, null, 2));
        console.log('=========================================\n');

        console.log('\n========== FACEBOOK DEBUG ==========');
        console.log(`URL: ${info.url}`);
        console.log(`TITLE: ${info.title}`);
        console.log(`LINKS: ${info.links}`);
        console.log(`ARTICLES: ${info.articles}`);
        console.log(`LOGIN: ${info.login}`);
        console.log(`CHECKPOINT: ${info.checkpoint}`);
        console.log(`BLOCKED: ${info.blocked}`);
        console.log(`BODY (first 500 chars): ${info.text.substring(0, 500)}`);
        console.log('====================================\n');

        if (this.debugScreenshot) {
          try {
            await page.screenshot({ path: '/tmp/facebook-debug.png', fullPage: true });
            this._log('📸 Screenshot: /tmp/facebook-debug.png');
          } catch {}
        }

        throw new Error('POST_DISCOVERY_ERROR: No Facebook post URLs found');
      }

      result.forEach((p, i) => this._log(`📌 Post ${i + 1}: ${p}`));
      return result;

    } catch (error) {
      this._error('discoverPendingPosts', error);
      throw error;
    } finally {
      // ✅ إغلاق الصفحة والمتصفح بشكل آمن
      if (page && !page.isClosed()) {
        try {
          await page.close();
        } catch (e) {
          this._warn(`Page close error: ${e.message}`);
        }
      }

      if (browser && browser.isConnected()) {
        try {
          await browser.close();
          this._log('🔒 Browser closed');
        } catch (e) {
          this._warn(`Browser close error: ${e.message}`);
        }
      }
    }
  }

  // =========================================================
  // FETCH POST TEXT
  // =========================================================

  async fetchPostText(rawCookies, postUrl) {
    this._log(`🍪 FETCH POST INPUT: ${Array.isArray(rawCookies) ? rawCookies.length : typeof rawCookies}`);

    let browser = null;
    let page = null;

    try {
      const url = this._extractPostUrl(postUrl);
      if (!url) {
        throw new Error(`POST_URL_ERROR: Invalid URL: ${postUrl}`);
      }

      browser = await this._launchBrowser();
      page = await this._createPage(browser, rawCookies);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(r => setTimeout(r, 3000));
      await this._checkAccess(page);

      const text = await page.evaluate(() => {
        const elements = [
          ...document.querySelectorAll('[role="article"],article,[data-pagelet*="FeedUnit"]')
        ];
        const texts = elements
          .map(e => e.innerText?.replace(/\s+/g, ' ').trim())
          .filter(x => x && x.length >= 20);
        return texts.sort((a, b) => b.length - a.length)[0] || '';
      });

      if (!text) {
        throw new Error('POST_TEXT_ERROR: No post text found');
      }

      this._log(`📄 Post text: ${text.length} chars`);
      return text;

    } catch (error) {
      this._error('fetchPostText', error);
      throw error;
    } finally {
      if (page && !page.isClosed()) {
        try { await page.close(); } catch (e) {}
      }
      if (browser && browser.isConnected()) {
        try { await browser.close(); } catch (e) {}
      }
    }
  }

  // =========================================================
  // COMMENTS
  // =========================================================

  async submitDualComments(rawCookies, postUrl, aiComment, hashtag) {
    this._log(`🍪 COMMENT INPUT: ${Array.isArray(rawCookies) ? rawCookies.length : typeof rawCookies}`);

    let browser = null;
    let page = null;

    try {
      const url = this._extractPostUrl(postUrl);
      if (!url) {
        throw new Error(`POST_URL_ERROR: Invalid URL: ${postUrl}`);
      }

      if (!String(aiComment || '').trim()) {
        throw new Error('COMMENT_ERROR: AI comment is empty');
      }

      if (!String(hashtag || '').trim()) {
        throw new Error('COMMENT_ERROR: Hashtag is empty');
      }

      browser = await this._launchBrowser();
      page = await this._createPage(browser, rawCookies);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(r => setTimeout(r, 3000));
      await this._checkAccess(page);

      const box = 'textarea[name="comment_text"],textarea';
      const button = 'input[type="submit"][name="post"],input[type="submit"]';

      await page.waitForSelector(box, { timeout: 15000 });
      await page.click(box);
      await page.type(box, String(aiComment).trim(), { delay: 15 });

      await page.waitForSelector(button, { timeout: 10000 });
      await page.click(button);
      await new Promise(r => setTimeout(r, 4000));

      this._log('✅ AI comment submitted');

      try {
        await page.waitForSelector(box, { timeout: 8000 });
      } catch {
        await page.goto(url, { waitUntil: 'domcontentloaded', timeout: 30000 });
        await new Promise(r => setTimeout(r, 2500));
        await page.waitForSelector(box, { timeout: 15000 });
      }

      await page.click(box);
      await page.type(box, String(hashtag).trim(), { delay: 15 });

      await page.waitForSelector(button, { timeout: 10000 });
      await page.click(button);
      await new Promise(r => setTimeout(r, 4000));

      this._log('🏷️ Hashtag comment submitted');
      return true;

    } catch (error) {
      this._error('submitDualComments', error);
      throw error;
    } finally {
      if (page && !page.isClosed()) {
        try { await page.close(); } catch (e) {}
      }
      if (browser && browser.isConnected()) {
        try { await browser.close(); } catch (e) {}
      }
    }
  }

  // =========================================================
  // COMMENT AS PAGE
  // =========================================================

  async submitCommentAsPage(rawCookies, postUrl, comment, pageId) {
    this._log(`🍪 PAGE COMMENT INPUT: ${Array.isArray(rawCookies) ? rawCookies.length : typeof rawCookies}`);

    let browser = null;
    let page = null;

    try {
      const url = this._extractPostUrl(postUrl);
      if (!url) {
        throw new Error(`POST_URL_ERROR: Invalid URL: ${postUrl}`);
      }

      browser = await this._launchBrowser();
      page = await this._createPage(browser, rawCookies);

      await page.goto(url, {
        waitUntil: 'domcontentloaded',
        timeout: 30000
      });

      await new Promise(r => setTimeout(r, 3000));
      await this._checkAccess(page);

      const box = 'textarea[name="comment_text"],textarea';
      const button = 'input[type="submit"][name="post"],input[type="submit"]';

      await page.waitForSelector(box, { timeout: 15000 });
      await page.click(box);
      await page.type(box, String(comment).trim(), { delay: 15 });

      try {
        const pageSelector = `[data-testid="actor-picker"]`;
        await page.waitForSelector(pageSelector, { timeout: 5000 });
        await page.click(pageSelector);

        const pageOption = `[role="menuitem"]:has-text("${pageId}")`;
        await page.waitForSelector(pageOption, { timeout: 5000 });
        await page.click(pageOption);

        await new Promise(r => setTimeout(r, 1000));
        this._log(`📄 Commenting as page: ${pageId}`);
      } catch (e) {
        this._log('ℹ️ Could not find page selector, commenting as personal');
      }

      await page.waitForSelector(button, { timeout: 10000 });
      await page.click(button);
      await new Promise(r => setTimeout(r, 4000));

      this._log(`✅ Page comment submitted as ${pageId}`);
      return true;

    } catch (error) {
      this._error('submitCommentAsPage', error);
      throw error;
    } finally {
      if (page && !page.isClosed()) {
        try { await page.close(); } catch (e) {}
      }
      if (browser && browser.isConnected()) {
        try { await browser.close(); } catch (e) {}
      }
    }
  }

  // =========================================================
  // COMMENT WITH ERROR HANDLING
  // =========================================================

  async submitCommentWithErrorHandling(identity, postUrl, comment, hashtag, messengerService, adminId) {
    const cookieManagerService = require('./cookieManager.service');

    try {
      let success = false;
      let errorMessage = null;

      try {
        if (identity.type === 'page') {
          success = await this.submitCommentAsPage(
            identity.cookies,
            postUrl,
            comment,
            identity.pageId
          );
        } else {
          success = await this.submitDualComments(
            identity.cookies,
            postUrl,
            comment,
            hashtag
          );
        }
      } catch (error) {
        errorMessage = error.message;
        console.error(`❌ ${identity.type === 'page' ? '📄' : '👤'} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''} failed: ${errorMessage}`);
      }

      if (!success && errorMessage) {
        await cookieManagerService.saveIdentityError(identity, errorMessage);

        const existingError = await cookieManagerService.getIdentityError(identity);
        if (!existingError) {
          const identityName = identity.type === 'page' 
            ? `صفحة: ${identity.pageName} (${identity.pageId})` 
            : `حساب: ${identity.accountName}`;
          
          await messengerService.sendTextMessage(
            adminId,
            `⚠️ **فشل التعليق عبر ${identityName}**\n\n` +
            `📌 المنشور: ${postUrl}\n` +
            `❌ السبب: ${errorMessage.substring(0, 150)}\n\n` +
            `🔄 سيتم تخطي هذه الهوية واستخدام التالية.`
          );
        }

        return false;
      }

      if (success) {
        await cookieManagerService.clearIdentityError(identity);
      }

      return success;

    } catch (error) {
      console.error(`❌ submitCommentWithErrorHandling error: ${error.message}`);
      return false;
    }
  }
}

module.exports = new FacebookService();
