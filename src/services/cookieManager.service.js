const Cookie = require('../models/Cookie');

class CookieManagerService {

  requiredCookies = ['c_user', 'xs'];

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
  // VALIDATE COOKIES (FORMAT ONLY)
  // =========================================================

  validateCookies(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return { 
        formatValid: false, 
        reason: 'COOKIES_EMPTY', 
        missing: [...this.requiredCookies], 
        cookieCount: 0 
      };
    }

    const names = new Set(cookies.map(c => c?.name).filter(Boolean));
    const missing = this.requiredCookies.filter(name => !names.has(name));

    if (missing.length > 0) {
      return { 
        formatValid: false, 
        reason: 'COOKIES_MISSING_REQUIRED', 
        missing, 
        cookieCount: cookies.length 
      };
    }

    const invalid = cookies.filter(c => !c?.name || !c?.value);
    if (invalid.length > 0) {
      return { 
        formatValid: false, 
        reason: 'COOKIES_WITHOUT_VALUE', 
        missing: [], 
        cookieCount: cookies.length 
      };
    }

    return { 
      formatValid: true, 
      reason: 'FORMAT_VALID', 
      missing: [], 
      cookieCount: cookies.length 
    };
  }

  // =========================================================
  // GET VALID ACTIVE ACCOUNT (FORMAT ONLY)
  // =========================================================

  async getValidActiveAccount() {
    console.log('[COOKIE-MANAGER] 🔍 Searching for valid ACTIVE account...');

    const accounts = await Cookie.find({ status: 'ACTIVE' });

    if (!accounts.length) {
      console.log('[COOKIE-MANAGER] ❌ No ACTIVE accounts found');
      return { account: null, reason: 'NO_ACTIVE_ACCOUNTS' };
    }

    for (const account of accounts) {
      const check = this.validateCookies(account.cookies);
      console.log(`[COOKIE-MANAGER] 👤 "${account.accountName}" | COUNT=${account.cookies?.length || 0} | FORMAT_VALID=${check.formatValid}`);

      if (!check.formatValid) {
        console.warn(`[COOKIE-MANAGER] ⚠️ Skipping "${account.accountName}" | ${check.reason}`);
        continue;
      }

      console.log(`[COOKIE-MANAGER] ✅ Format valid: "${account.accountName}"`);
      return { 
        account, 
        cookies: account.cookies, 
        accountName: account.accountName,
        formatValid: true
      };
    }

    console.error('[COOKIE-MANAGER] ❌ No valid accounts');
    return { account: null, reason: 'ALL_INVALID' };
  }

  // =========================================================
  // GET ALL ACTIVE IDENTITIES
  // =========================================================

  async getAllActiveIdentities() {
    const accounts = await Cookie.find({ status: 'ACTIVE' });
    const identities = [];

    for (const account of accounts) {
      identities.push({
        type: 'personal',
        accountId: account._id,
        accountName: account.accountName,
        cookies: account.cookies,
        cooldownUntil: account.cooldownUntil,
        commentsCount: account.personalCommentsCount || 0,
        pages: account.pages?.filter(p => p.status === 'ACTIVE') || []
      });

      for (const page of (account.pages || [])) {
        if (page.status === 'ACTIVE') {
          identities.push({
            type: 'page',
            accountId: account._id,
            accountName: account.accountName,
            pageId: page.pageId,
            pageName: page.pageName,
            cookies: account.cookies,
            cooldownUntil: page.cooldownUntil,
            commentsCount: page.commentsCount || 0
          });
        }
      }
    }

    return identities;
  }

  // =========================================================
  // GET NEXT AVAILABLE IDENTITY
  // =========================================================

  async getNextAvailableIdentity() {
    const identities = await this.getAllActiveIdentities();
    const now = new Date();

    const available = identities.filter(i => {
      const cooldown = i.cooldownUntil ? new Date(i.cooldownUntil) : null;
      return !cooldown || cooldown <= now;
    });

    if (!available.length) {
      console.log('⚠️ No available identities');
      return null;
    }

    available.sort((a, b) => (a.commentsCount || 0) - (b.commentsCount || 0));
    return available[0];
  }

  // =========================================================
  // UPDATE IDENTITY USAGE
  // =========================================================

  async updateIdentityUsage(identity) {
    try {
      if (identity.type === 'personal') {
        await Cookie.findByIdAndUpdate(identity.accountId, {
          $inc: { personalCommentsCount: 1 },
          lastUsedAt: new Date()
        });
      } else if (identity.type === 'page') {
        await Cookie.findOneAndUpdate(
          { _id: identity.accountId, 'pages.pageId': identity.pageId },
          { $inc: { 'pages.$.commentsCount': 1 } }
        );
      }
    } catch (error) {
      console.error(`❌ Update failed: ${error.message}`);
    }
  }

  // =========================================================
  // SET COOLDOWN
  // =========================================================

  async setCooldown(identity, minutes = 10) {
    const cooldownUntil = new Date(Date.now() + minutes * 60 * 1000);
    try {
      if (identity.type === 'personal') {
        await Cookie.findByIdAndUpdate(identity.accountId, { cooldownUntil });
      } else if (identity.type === 'page') {
        await Cookie.findOneAndUpdate(
          { _id: identity.accountId, 'pages.pageId': identity.pageId },
          { $set: { 'pages.$.cooldownUntil': cooldownUntil } }
        );
      }
    } catch (error) {
      console.error(`❌ Cooldown failed: ${error.message}`);
    }
  }

  // =========================================================
  // ADD / UPDATE ACCOUNT
  // =========================================================

  async addCookies(accountName, cookiesInput) {
    if (!accountName || !String(accountName).trim()) {
      throw new Error('ACCOUNT_NAME_REQUIRED');
    }

    let cookiesArray = [];

    if (typeof cookiesInput === 'string') {
      const pairs = cookiesInput.split(';').map(p => p.trim()).filter(Boolean);
      for (const pair of pairs) {
        const equalIndex = pair.indexOf('=');
        if (equalIndex > 0) {
          const name = pair.substring(0, equalIndex).trim();
          const value = pair.substring(equalIndex + 1).trim();
          if (name && value) {
            cookiesArray.push({
              name,
              value,
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
      throw new Error('COOKIE_ERROR: Invalid cookie format');
    }

    if (!cookiesArray.length) {
      throw new Error('COOKIE_ERROR: No valid cookies extracted');
    }

    const names = cookiesArray.map(c => c.name);
    console.log(`[COOKIE-MANAGER] 📝 Extracted cookies: ${names.join(', ')}`);

    const result = await Cookie.findOneAndUpdate(
      { accountName: accountName.trim() },
      {
        accountName: accountName.trim(),
        cookies: cookiesArray,
        status: 'ACTIVE',
        cooldownUntil: null,
        lastUsedAt: new Date()
      },
      {
        new: true,
        upsert: true
      }
    );

    console.log(`[COOKIE-MANAGER] ✅ Account "${accountName}" saved with ${result.cookies?.length || 0} cookies`);
    return result;
  }

  // =========================================================
  // SAVE ERROR
  // =========================================================

  async saveIdentityError(identity, errorMessage) {
    try {
      const now = new Date();
      const errorText = errorMessage.substring(0, 200);

      if (identity.type === 'personal') {
        const account = await Cookie.findById(identity.accountId);
        if (account && account.lastError === errorText) return;
        await Cookie.findByIdAndUpdate(identity.accountId, {
          lastError: errorText,
          lastErrorTime: now
        });
      } else if (identity.type === 'page') {
        const account = await Cookie.findOne(
          { _id: identity.accountId, 'pages.pageId': identity.pageId }
        );
        const page = account?.pages?.find(p => p.pageId === identity.pageId);
        if (page && page.lastError === errorText) return;
        await Cookie.findOneAndUpdate(
          { _id: identity.accountId, 'pages.pageId': identity.pageId },
          { $set: { 'pages.$.lastError': errorText, 'pages.$.lastErrorTime': now } }
        );
      }
    } catch (err) {
      console.error(`❌ Failed to save error: ${err.message}`);
    }
  }

  // =========================================================
  // GET IDENTITY ERROR
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
  // CLEAR IDENTITY ERROR
  // =========================================================

  async clearIdentityError(identity) {
    try {
      if (identity.type === 'personal') {
        await Cookie.findByIdAndUpdate(identity.accountId, {
          $unset: { lastError: 1, lastErrorTime: 1 }
        });
      } else if (identity.type === 'page') {
        await Cookie.findOneAndUpdate(
          { _id: identity.accountId, 'pages.pageId': identity.pageId },
          { $unset: { 'pages.$.lastError': 1, 'pages.$.lastErrorTime': 1 } }
        );
      }
    } catch (err) {
      console.error(`❌ Failed to clear error: ${err.message}`);
    }
  }

  // =========================================================
  // GET ALL ACCOUNTS
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
  // DELETE ACCOUNT
  // =========================================================

  async deleteAccount(accountName) {
    return await Cookie.findOneAndDelete({ accountName });
  }

  // =========================================================
  // DELETE INACTIVE
  // =========================================================

  async deleteInactiveAccounts() {
    return await Cookie.deleteMany({ status: 'BLOCKED' });
  }

  // =========================================================
  // ADD PAGE
  // =========================================================

  async addPageToAccount(accountName, pageId, pageName) {
    const account = await Cookie.findOne({ accountName });
    if (!account) throw new Error(`Account not found: ${accountName}`);
    
    if (account.pages?.some(p => p.pageId === pageId)) {
      throw new Error(`Page already exists: ${pageId}`);
    }

    account.pages = account.pages || [];
    account.pages.push({
      pageId,
      pageName,
      status: 'ACTIVE',
      commentsCount: 0
    });

    await account.save();
    return account;
  }

  // =========================================================
  // GET ACCOUNT PAGES
  // =========================================================

  async getAccountPages(accountName) {
    const account = await Cookie.findOne({ accountName });
    return account?.pages || [];
  }

  // =========================================================
  // DELETE PAGE
  // =========================================================

  async deletePage(accountName, pageId) {
    return await Cookie.findOneAndUpdate(
      { accountName },
      { $pull: { pages: { pageId } } },
      { new: true }
    );
  }

  // =========================================================
  // BLOCK ACCOUNT
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
}

module.exports = new CookieManagerService();
