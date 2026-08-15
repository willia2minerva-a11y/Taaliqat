// src/services/cookieManager.service.js

const Cookie = require('../models/Cookie');

class CookieManagerService {

  // =========================================================
  // REQUIRED FACEBOOK COOKIES
  // =========================================================

  requiredCookies = ['datr', 'fr', 'c_user', 'xs'];

  // =========================================================
  // NORMALIZE COOKIE DATA
  // يدعم:
  // 1) Array [{name,value}]
  // 2) String: datr=xxx;sb=xxx;c_user=xxx;xs=xxx;fr=xxx
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
          ...(c.expires && Number(c.expires) > 0
            ? { expires: Number(c.expires) }
            : {})
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

    const names = new Set(
      normalized.map(c => c.name)
    );

    const missing = this.requiredCookies.filter(
      name => !names.has(name)
    );

    if (missing.length) {
      return {
        valid: false,
        cookies: normalized,
        reason: 'COOKIES_MISSING_REQUIRED',
        missing
      };
    }

    const invalidValues = normalized.filter(
      c => !c.value || !String(c.value).trim()
    );

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
  // CHECK ALL ACCOUNTS
  // =========================================================

  async diagnoseAccounts() {
    const accounts = await Cookie.find({});

    console.log(
      `[COOKIE-MANAGER] 📊 Found ${accounts.length} account(s)`
    );

    const result = [];

    for (const account of accounts) {
      const name =
        account.accountName ||
        'UNKNOWN';

      const status =
        account.status || 'UNKNOWN';

      const check =
        this.validateCookies(
          account.cookies
        );

      const item = {
        id: account._id,
        accountName: name,
        status,
        valid: check.valid,
        reason: check.reason,
        missing: check.missing,
        cookieCount: check.cookies.length,
        cookieNames: check.cookies.map(c => c.name),
        lastUsedAt: account.lastUsedAt || null,
        cookies: check.cookies
      };

      result.push(item);

      console.log(
        `[COOKIE-MANAGER] 👤 Account="${name}" | STATUS=${status} | COOKIE_COUNT=${item.cookieCount} | VALID=${check.valid} | REASON=${check.reason}`
      );

      if (!check.valid) {
        console.warn(
          `[COOKIE-MANAGER][WARN] ⚠️ Skipping "${name}": ${check.reason}` +
          (
            check.missing.length
              ? ` | Missing: ${check.missing.join(', ')}`
              : ''
          )
        );
      }
    }

    return result;
  }

  // =========================================================
  // GET FIRST VALID ACTIVE ACCOUNT
  // الحسابات غير ACTIVE يتم تجاهلها
  // الكوكيز الخاطئة يتم تجاهلها
  // =========================================================

  async getValidActiveAccount() {
    console.log(
      '[COOKIE-MANAGER] 🔍 Searching for a valid ACTIVE Facebook account...'
    );

    const accounts =
      await Cookie.find({
        status: 'ACTIVE'
      }).sort({
        lastUsedAt: 1
      });

    console.log(
      `[COOKIE-MANAGER] 📊 Found ${accounts.length} ACTIVE account(s)`
    );

    if (!accounts.length) {
      return {
        account: null,
        reason: 'NO_ACTIVE_ACCOUNTS'
      };
    }

    for (const account of accounts) {
      const name =
        account.accountName ||
        'UNKNOWN';

      const check =
        this.validateCookies(
          account.cookies
        );

      console.log(
        `[COOKIE-MANAGER] 👤 Account="${name}" | STATUS=ACTIVE | COOKIE_COUNT=${check.cookies.length} | VALID=${check.valid} | REASON=${check.reason}`
      );

      if (!check.valid) {
        console.warn(
          `[COOKIE-MANAGER][WARN] ⚠️ Skipping "${name}" | ${check.reason}` +
          (
            check.missing.length
              ? ` | Missing: ${check.missing.join(', ')}`
              : ''
          )
        );

        continue;
      }

      console.log(
        `[COOKIE-MANAGER] ✅ Using account: "${name}"`
      );

      return {
        account,
        cookies: check.cookies,
        accountName: name,
        reason: 'VALID'
      };
    }

    console.error(
      '[COOKIE-MANAGER][ERROR] ❌ All ACTIVE accounts have invalid cookies'
    );

    return {
      account: null,
      reason: 'ALL_ACTIVE_COOKIES_INVALID'
    };
  }

  // =========================================================
  // GET ALL ACCOUNTS
  // =========================================================

  async getAllCookies() {
    try {
      return await Cookie.find({});
    } catch (error) {
      console.error(
        `[COOKIE-MANAGER][ERROR] ${error.message}`
      );

      return [];
    }
  }

  // =========================================================
  // ADD / UPDATE ACCOUNT
  // =========================================================

  async addCookies(accountName, cookies) {
    const normalized =
      this.normalizeCookies(cookies);

    if (!normalized.length) {
      throw new Error(
        'COOKIE_ERROR: No valid cookies supplied'
      );
    }

    return await Cookie.findOneAndUpdate(
      { accountName },
      {
        accountName,
        cookies: normalized,
        status: 'ACTIVE',
        cooldownUntil: null,
        lastUsedAt: new Date()
      },
      {
        new: true,
        upsert: true
      }
    );
  }

  // =========================================================
  // UPDATE USAGE
  // =========================================================

  async updateCookieUsage(id) {
    try {
      await Cookie.findByIdAndUpdate(
        id,
        {
          lastUsedAt: new Date()
        }
      );
    } catch (error) {
      console.error(
        `[COOKIE-MANAGER][ERROR] Usage update failed: ${error.message}`
      );
    }
  }

  // =========================================================
  // BLOCK ACCOUNT
  // =========================================================

  async blockCookie(
    id,
    reason = 'Blocked'
  ) {
    console.warn(
      `[COOKIE-MANAGER] 🚫 Blocking account ${id}: ${reason}`
    );

    return await Cookie.findByIdAndUpdate(
      id,
      {
        status: 'BLOCKED',
        cooldownUntil:
          new Date(
            Date.now() +
            30 * 60 * 1000
          )
      },
      { new: true }
    );
  }

  // =========================================================
  // UNBLOCK
  // =========================================================

  async unblockCookie(id) {
    return await Cookie.findByIdAndUpdate(
      id,
      {
        status: 'ACTIVE',
        cooldownUntil: null
      },
      { new: true }
    );
  }

  // =========================================================
  // DELETE ACCOUNT
  // =========================================================

  async deleteAccount(accountName) {
    return await Cookie.findOneAndDelete({
      accountName
    });
  }

  // =========================================================
  // DELETE BLOCKED
  // =========================================================

  async deleteInactiveAccounts() {
    return await Cookie.deleteMany({
      status: 'BLOCKED'
    });
  }
}

module.exports =
  new CookieManagerService();
