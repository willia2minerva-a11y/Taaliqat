const Cookie = require('../models/Cookie');

class CookieManagerService {

  // =========================================================
  // REQUIRED FACEBOOK COOKIES
  // =========================================================

  requiredCookies = ['datr', 'fr', 'c_user', 'xs'];

  // =========================================================
  // NORMALIZE COOKIE DATA
  // =========================================================

  normalizeCookies(cookies) {
    if (Array.isArray(cookies)) {
      return cookies
        .filter(c => c && c.name && c.value !== undefined)
        .map(c => ({
          name: String(c.name).trim(),
          value: String(c.value),
          domain: c.domain || '.facebook.com',
          path: c.path || '/',
          secure: c.secure !== false,
          httpOnly: Boolean(c.httpOnly),
          ...(c.sameSite ? { sameSite: c.sameSite } : {}),
          ...(c.expires && Number(c.expires) > 0 ? { expires: Number(c.expires) } : {})
        }));
    }

    if (typeof cookies === 'string') {
      return cookies
        .split(';')
        .map(x => x.trim())
        .filter(Boolean)
        .map(pair => {
          const index = pair.indexOf('=');
          if (index <= 0) return null;
          return {
            name: pair.slice(0, index).trim(),
            value: pair.slice(index + 1).trim(),
            domain: '.facebook.com',
            path: '/',
            secure: true,
            httpOnly: false
          };
        })
        .filter(Boolean);
    }

    return [];
  }

  // =========================================================
  // VALIDATE COOKIE SET
  // =========================================================

  validateCookies(cookies) {
    const normalized = this.normalizeCookies(cookies);

    if (!normalized.length) {
      return {
        valid: false,
        cookies: [],
        reason: 'COOKIES_EMPTY',
        missing: [...this.requiredCookies]
      };
    }

    const names = new Set(normalized.map(c => c.name));
    const missing = this.requiredCookies.filter(name => !names.has(name));

    if (missing.length) {
      return {
        valid: false,
        cookies: normalized,
        reason: 'COOKIES_MISSING_REQUIRED',
        missing
      };
    }

    const invalidValues = normalized.filter(c => !c.value || !String(c.value).trim());
    if (invalidValues.length) {
      return {
        valid: false,
        cookies: normalized,
        reason: 'COOKIES_EMPTY_VALUE',
        missing: []
      };
    }

    return {
      valid: true,
      cookies: normalized,
      reason: 'VALID',
      missing: []
    };
  }

  // =========================================================
  // ✅ ADD / UPDATE ACCOUNT (مع دعم صيغ متعددة)
  // =========================================================

  async addCookies(accountName, cookiesInput) {
    if (!accountName || !String(accountName).trim()) {
      throw new Error('ACCOUNT_NAME_REQUIRED: Please provide a valid account name');
    }

    // ✅ تحويل المدخلات إلى مصفوفة كوكيز
    let cookiesArray = [];

    if (typeof cookiesInput === 'string') {
      // ✅ تقسيم النص إلى أزواج name=value
      const pairs = cookiesInput.split(';').map(p => p.trim()).filter(Boolean);
      
      for (const pair of pairs) {
        const equalIndex = pair.indexOf('=');
        if (equalIndex > 0) {
          const name = pair.substring(0, equalIndex).trim();
          const value = pair.substring(equalIndex + 1).trim();
          if (name && value) {
            cookiesArray.push({
              name: name,
              value: value,
              domain: '.facebook.com',
              path: '/',
              secure: true,
              httpOnly: false
            });
          }
        }
      }
    } else if (Array.isArray(cookiesInput)) {
      cookiesArray = cookiesInput.map(c => ({
        name: String(c.name).trim(),
        value: String(c.value),
        domain: c.domain || '.facebook.com',
        path: c.path || '/',
        secure: c.secure !== false,
        httpOnly: Boolean(c.httpOnly)
      }));
    } else {
      throw new Error('COOKIE_ERROR: Invalid cookie format. Expected string or array.');
    }

    // ✅ التحقق من وجود كوكيز
    if (!cookiesArray.length) {
      throw new Error('COOKIE_ERROR: No valid cookies extracted');
    }

    // ✅ طباعة أسماء الكوكيز للتصحيح
    const names = cookiesArray.map(c => c.name);
    console.log(`[COOKIE-MANAGER] 📝 Extracted cookies: ${names.join(', ')}`);

    // ✅ التحقق من وجود الكوكيز الأساسية (تحذير فقط)
    const required = ['datr', 'c_user', 'xs', 'fr'];
    const missing = required.filter(r => !names.includes(r));
    
    if (missing.length) {
      console.warn(`[COOKIE-MANAGER] ⚠️ Missing required cookies: ${missing.join(', ')}`);
      console.warn(`[COOKIE-MANAGER] ⚠️ Found: ${names.join(', ')}`);
    }

    // ✅ تخزين الكوكيز في قاعدة البيانات (استبدال كامل)
    const result = await Cookie.findOneAndUpdate(
      { accountName: accountName.trim() },
      {
        accountName: accountName.trim(),
        cookies: cookiesArray,
        status: 'ACTIVE',
        cooldownUntil: null,
        lastUsedAt: new Date(),
        // ✅ إزالة أي أخطاء سابقة عند التحديث
        $unset: { lastError: 1, lastErrorTime: 1 }
      },
      {
        new: true,
        upsert: true
      }
    );

    console.log(`[COOKIE-MANAGER] ✅ Account "${accountName}" saved with ${cookiesArray.length} cookies`);
    return result;
  }

  // =========================================================
  // GET VALID ACTIVE ACCOUNT
  // =========================================================

  async getValidActiveAccount() {
    console.log('[COOKIE-MANAGER] 🔍 Searching for a valid ACTIVE Facebook account...');

    const accounts = await Cookie.find({ status: 'ACTIVE' }).sort({ lastUsedAt: 1 });

    console.log(`[COOKIE-MANAGER] 📊 Found ${accounts.length} ACTIVE account(s)`);

    if (!accounts.length) {
      return {
        account: null,
        reason: 'NO_ACTIVE_ACCOUNTS'
      };
    }

    for (const account of accounts) {
      const name = account.accountName || 'UNKNOWN';
      const check = this.validateCookies(account.cookies);

      console.log(
        `[COOKIE-MANAGER] 👤 Account="${name}" | STATUS=ACTIVE | COOKIE_COUNT=${check.cookies.length} | VALID=${check.valid}`
      );

      if (!check.valid) {
        console.warn(`[COOKIE-MANAGER][WARN] ⚠️ Skipping "${name}" | ${check.reason}`);
        continue;
      }

      console.log(`[COOKIE-MANAGER] ✅ Using account: "${name}"`);
      return {
        account,
        cookies: check.cookies,
        accountName: name,
        reason: 'VALID'
      };
    }

    console.error('[COOKIE-MANAGER][ERROR] ❌ All ACTIVE accounts have invalid cookies');
    return {
      account: null,
      reason: 'ALL_ACTIVE_COOKIES_INVALID'
    };
  }

  // =========================================================
  // ✅ GET ALL ACTIVE IDENTITIES (PERSONAL + PAGES)
  // =========================================================

  async getAllActiveIdentities() {
    const accounts = await Cookie.find({ status: 'ACTIVE' });
    const identities = [];

    for (const account of accounts) {
      // إضافة الحساب الشخصي
      identities.push({
        type: 'personal',
        accountId: account._id,
        accountName: account.accountName,
        cookies: account.cookies,
        cooldownUntil: account.cooldownUntil,
        lastUsedAt: account.lastUsedAt,
        commentsCount: account.personalCommentsCount || 0,
        status: account.status,
        lastError: account.lastError || null,
        pages: account.pages.filter(p => p.status === 'ACTIVE')
      });

      // إضافة الصفحات النشطة
      for (const page of account.pages) {
        if (page.status === 'ACTIVE') {
          identities.push({
            type: 'page',
            accountId: account._id,
            accountName: account.accountName,
            pageId: page.pageId,
            pageName: page.pageName,
            cookies: account.cookies,
            cooldownUntil: page.cooldownUntil,
            lastUsedAt: page.lastUsedAt,
            commentsCount: page.commentsCount || 0,
            pageAccessToken: page.pageAccessToken,
            status: page.status,
            lastError: page.lastError || null
          });
        }
      }
    }

    console.log(`📊 Found ${identities.length} active identities (personal + pages)`);
    return identities;
  }

  // =========================================================
  // ✅ GET NEXT AVAILABLE IDENTITY
  // =========================================================

  async getNextAvailableIdentity() {
    const identities = await this.getAllActiveIdentities();

    // فلترة الهويات غير المبردة
    const available = identities.filter(identity => {
      const now = new Date();
      const cooldown = identity.cooldownUntil ? new Date(identity.cooldownUntil) : null;
      return !cooldown || cooldown <= now;
    });

    if (available.length === 0) {
      console.log('⚠️ No available identities (all in cooldown)');
      return null;
    }

    // توزيع عادل: اختيار الهوية الأقل استخداماً
    available.sort((a, b) => (a.commentsCount || 0) - (b.commentsCount || 0));

    const selected = available[0];
    console.log(`✅ Selected identity: ${selected.type === 'page' ? '📄' : '👤'} ${selected.accountName}${selected.pageName ? ' - ' + selected.pageName : ''}`);
    return selected;
  }

  // =========================================================
  // ✅ UPDATE IDENTITY USAGE
  // =========================================================

  async updateIdentityUsage(identity) {
    try {
      if (identity.type === 'personal') {
        await Cookie.findByIdAndUpdate(
          identity.accountId,
          {
            $inc: { personalCommentsCount: 1 },
            lastUsedAt: new Date()
          }
        );
      } else if (identity.type === 'page') {
        await Cookie.findOneAndUpdate(
          { _id: identity.accountId, 'pages.pageId': identity.pageId },
          {
            $inc: { 'pages.$.commentsCount': 1 },
            $set: { 'pages.$.lastUsedAt': new Date() }
          }
        );
      }
    } catch (error) {
      console.error(`❌ Update identity usage failed: ${error.message}`);
    }
  }

  // =========================================================
  // ✅ SET COOLDOWN FOR IDENTITY
  // =========================================================

  async setCooldown(identity, minutes = 10) {
    const cooldownUntil = new Date(Date.now() + minutes * 60 * 1000);

    try {
      if (identity.type === 'personal') {
        await Cookie.findByIdAndUpdate(
          identity.accountId,
          { cooldownUntil }
        );
      } else if (identity.type === 'page') {
        await Cookie.findOneAndUpdate(
          { _id: identity.accountId, 'pages.pageId': identity.pageId },
          { $set: { 'pages.$.cooldownUntil': cooldownUntil } }
        );
      }
      console.log(`⏰ Cooldown set for ${identity.type} ${identity.accountName}${identity.pageName ? ' - ' + identity.pageName : ''} for ${minutes} minutes`);
    } catch (error) {
      console.error(`❌ Set cooldown failed: ${error.message}`);
    }
  }

  // =========================================================
  // ✅ SAVE ERROR FOR IDENTITY (مرة واحدة فقط)
  // =========================================================

  async saveIdentityError(identity, errorMessage) {
    try {
      const now = new Date();
      const errorText = errorMessage.substring(0, 200);

      if (identity.type === 'personal') {
        const account = await Cookie.findById(identity.accountId);
        if (account && account.lastError === errorText) {
          return;
        }

        await Cookie.findByIdAndUpdate(
          identity.accountId,
          {
            lastError: errorText,
            lastErrorTime: now
          }
        );
        console.log(`📝 Error saved for account: ${identity.accountName}`);
      } 
      else if (identity.type === 'page') {
        const account = await Cookie.findOne(
          { _id: identity.accountId, 'pages.pageId': identity.pageId }
        );
        const page = account?.pages?.find(p => p.pageId === identity.pageId);
        if (page && page.lastError === errorText) {
          return;
        }

        await Cookie.findOneAndUpdate(
          { _id: identity.accountId, 'pages.pageId': identity.pageId },
          {
            $set: {
              'pages.$.lastError': errorText,
              'pages.$.lastErrorTime': now
            }
          }
        );
        console.log(`📝 Error saved for page: ${identity.pageName} (${identity.pageId})`);
      }
    } catch (err) {
      console.error(`❌ Failed to save error: ${err.message}`);
    }
  }

  // =========================================================
  // ✅ GET IDENTITY ERROR
  // =========================================================

  async getIdentityError(identity) {
    try {
      if (identity.type === 'personal') {
        const account = await Cookie.findById(identity.accountId);
        return account?.lastError || null;
      } else if (identity.type === 'page') {
        const account = await Cookie.findOne(
          { _id: identity.accountId, 'pages.pageId': identity.pageId }
        );
        const page = account?.pages?.find(p => p.pageId === identity.pageId);
        return page?.lastError || null;
      }
    } catch (err) {
      return null;
    }
    return null;
  }

  // =========================================================
  // ✅ CLEAR ERROR (بعد حل المشكلة)
  // =========================================================

  async clearIdentityError(identity) {
    try {
      if (identity.type === 'personal') {
        await Cookie.findByIdAndUpdate(
          identity.accountId,
          {
            $unset: { lastError: 1, lastErrorTime: 1 }
          }
        );
      } else if (identity.type === 'page') {
        await Cookie.findOneAndUpdate(
          { _id: identity.accountId, 'pages.pageId': identity.pageId },
          {
            $unset: {
              'pages.$.lastError': 1,
              'pages.$.lastErrorTime': 1
            }
          }
        );
      }
    } catch (err) {
      console.error(`❌ Failed to clear error: ${err.message}`);
    }
  }

  // =========================================================
  // ✅ ADD PAGE TO ACCOUNT
  // =========================================================

  async addPageToAccount(accountName, pageId, pageName, pageAccessToken = null) {
    const account = await Cookie.findOne({ accountName });
    if (!account) {
      throw new Error(`ACCOUNT_NOT_FOUND: ${accountName}`);
    }

    if (account.pages.some(p => p.pageId === pageId)) {
      throw new Error(`PAGE_ALREADY_EXISTS: ${pageId}`);
    }

    account.pages.push({
      pageId,
      pageName,
      pageAccessToken,
      status: 'ACTIVE',
      cooldownUntil: null,
      lastUsedAt: null,
      commentsCount: 0,
      lastError: null,
      lastErrorTime: null
    });

    await account.save();
    console.log(`✅ Added page "${pageName}" (${pageId}) to account "${accountName}"`);
    return account;
  }

  // =========================================================
  // ✅ GET ACCOUNT PAGES
  // =========================================================

  async getAccountPages(accountName) {
    const account = await Cookie.findOne({ accountName });
    if (!account) return [];
    return account.pages;
  }

  // =========================================================
  // ✅ BLOCK PAGE
  // =========================================================

  async blockPage(accountName, pageId, reason = 'Blocked') {
    console.warn(`🚫 Blocking page ${pageId} for account ${accountName}: ${reason}`);
    
    return await Cookie.findOneAndUpdate(
      { accountName, 'pages.pageId': pageId },
      {
        $set: {
          'pages.$.status': 'BLOCKED',
          'pages.$.cooldownUntil': new Date(Date.now() + 30 * 60 * 1000)
        }
      },
      { new: true }
    );
  }

  // =========================================================
  // ✅ DELETE PAGE
  // =========================================================

  async deletePage(accountName, pageId) {
    return await Cookie.findOneAndUpdate(
      { accountName },
      { $pull: { pages: { pageId } } },
      { new: true }
    );
  }

  // =========================================================
  // ✅ GET ALL ACCOUNTS
  // =========================================================

  async getAllCookies() {
    try {
      return await Cookie.find({});
    } catch (error) {
      console.error(`[COOKIE-MANAGER][ERROR] ${error.message}`);
      return [];
    }
  }

  // =========================================================
  // ✅ UPDATE USAGE
  // =========================================================

  async updateCookieUsage(id) {
    try {
      await Cookie.findByIdAndUpdate(id, { lastUsedAt: new Date() });
    } catch (error) {
      console.error(`[COOKIE-MANAGER][ERROR] Usage update failed: ${error.message}`);
    }
  }

  // =========================================================
  // ✅ BLOCK ACCOUNT
  // =========================================================

  async blockCookie(id, reason = 'Blocked') {
    console.warn(`[COOKIE-MANAGER] 🚫 Blocking account ${id}: ${reason}`);
    return await Cookie.findByIdAndUpdate(
      id,
      {
        status: 'BLOCKED',
        cooldownUntil: new Date(Date.now() + 30 * 60 * 1000)
      },
      { new: true }
    );
  }

  // =========================================================
  // ✅ UNBLOCK
  // =========================================================

  async unblockCookie(id) {
    return await Cookie.findByIdAndUpdate(
      id,
      { status: 'ACTIVE', cooldownUntil: null },
      { new: true }
    );
  }

  // =========================================================
  // ✅ DELETE ACCOUNT
  // =========================================================

  async deleteAccount(accountName) {
    return await Cookie.findOneAndDelete({ accountName });
  }

  // =========================================================
  // ✅ DELETE BLOCKED
  // =========================================================

  async deleteInactiveAccounts() {
    return await Cookie.deleteMany({ status: 'BLOCKED' });
  }
}

module.exports = new CookieManagerService();
