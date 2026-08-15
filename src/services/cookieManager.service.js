// src/services/cookieManager.service.js

const Cookie = require('../models/Cookie');

class CookieManagerService {

  constructor() {
    // Facebook عادة يحتاج هذه المجموعة الأساسية
    this.requiredCookies = [
      'datr',
      'fr',
      'c_user',
      'xs'
    ];
  }

  // =========================================================
  // LOGGING
  // =========================================================

  _log(message) {
    console.log(
      `[COOKIE-MANAGER] ${message}`
    );
  }

  _warn(message) {
    console.warn(
      `[COOKIE-MANAGER][WARN] ${message}`
    );
  }

  _error(message) {
    console.error(
      `[COOKIE-MANAGER][ERROR] ${message}`
    );
  }

  // =========================================================
  // NORMALIZE COOKIE STRING
  // =========================================================

  normalizeCookies(rawCookies) {

    // -------------------------------------------------------
    // NULL / EMPTY
    // -------------------------------------------------------

    if (
      rawCookies === null ||
      rawCookies === undefined
    ) {
      return [];
    }

    // -------------------------------------------------------
    // ARRAY
    // -------------------------------------------------------

    if (Array.isArray(rawCookies)) {

      return rawCookies
        .filter(cookie => cookie)
        .map(cookie => {

          // already Puppeteer format
          if (
            cookie.name &&
            cookie.value !== undefined
          ) {
            return {
              name: String(cookie.name),
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
          }

          return null;
        })
        .filter(Boolean);
    }

    // -------------------------------------------------------
    // STRING
    //
    // datr=xxx;sb=xxx;c_user=xxx;xs=xxx;fr=xxx
    // -------------------------------------------------------

    if (typeof rawCookies === 'string') {

      const result = [];

      const parts =
        rawCookies
          .split(';')
          .map(part => part.trim())
          .filter(Boolean);

      for (const part of parts) {

        const equalIndex =
          part.indexOf('=');

        if (equalIndex === -1) {
          continue;
        }

        const name =
          part
            .slice(0, equalIndex)
            .trim();

        const value =
          part
            .slice(equalIndex + 1)
            .trim();

        if (!name) {
          continue;
        }

        result.push({
          name,
          value,
          domain: '.facebook.com',
          path: '/',
          secure: true,
          httpOnly: false
        });
      }

      return result;
    }

    return [];
  }

  // =========================================================
  // GET COOKIE NAMES
  // =========================================================

  getCookieNames(rawCookies) {

    const cookies =
      this.normalizeCookies(
        rawCookies
      );

    return [
      ...new Set(
        cookies
          .map(cookie => cookie.name)
          .filter(Boolean)
      )
    ];
  }

  // =========================================================
  // VALIDATE COOKIE SET
  // =========================================================

  validateCookieSet(rawCookies) {

    const cookies =
      this.normalizeCookies(
        rawCookies
      );

    if (
      cookies.length === 0
    ) {
      return {
        valid: false,
        reason: 'COOKIES_EMPTY',
        missing: [
          ...this.requiredCookies
        ],
        cookies: []
      };
    }

    const names =
      new Set(
        cookies.map(
          cookie => cookie.name
        )
      );

    const missing =
      this.requiredCookies.filter(
        name => !names.has(name)
      );

    if (
      missing.length > 0
    ) {
      return {
        valid: false,
        reason: 'COOKIES_MISSING_REQUIRED',
        missing,
        cookies
      };
    }

    return {
      valid: true,
      reason: 'VALID',
      missing: [],
      cookies
    };
  }

  // =========================================================
  // VALIDATE ONE ACCOUNT
  // =========================================================

  validateAccount(cookieDoc) {

    const accountName =
      cookieDoc?.accountName ||
      'UNKNOWN';

    const status =
      cookieDoc?.status ||
      'UNKNOWN';

    const result =
      this.validateCookieSet(
        cookieDoc?.cookies
      );

    return {
      accountId:
        cookieDoc?._id
          ? String(cookieDoc._id)
          : null,

      accountName,

      status,

      cookieCount:
        result.cookies.length,

      cookieNames:
        result.cookies.map(
          cookie => cookie.name
        ),

      valid:
        status === 'ACTIVE' &&
        result.valid,

      reason:
        status !== 'ACTIVE'
          ? `ACCOUNT_${status}`
          : result.reason,

      missing:
        result.missing,

      cookies:
        result.cookies,

      lastUsedAt:
        cookieDoc?.lastUsedAt || null
    };
  }

  // =========================================================
  // GET ALL ACCOUNTS
  // =========================================================

  async getAllCookies() {

    try {

      const accounts =
        await Cookie.find({})
          .sort({
            lastUsedAt: 1
          });

      this._log(
        `📊 Found ${accounts.length} cookie account(s)`
      );

      return accounts;

    } catch (error) {

      this._error(
        `Failed to load accounts: ${error.message}`
      );

      return [];
    }
  }

  // =========================================================
  // GET VALID ACTIVE ACCOUNT
  //
  // لا يرمي Error إذا وجد حسابًا تالفًا.
  // فقط ينتقل للحساب التالي.
  // =========================================================

  async getValidActiveAccount() {

    this._log(
      '🔍 Searching for a valid ACTIVE Facebook account...'
    );

    const accounts =
      await this.getAllCookies();

    if (
      accounts.length === 0
    ) {

      this._warn(
        '⚠️ No Facebook cookie accounts exist'
      );

      return null;
    }

    const diagnostics = [];

    // -------------------------------------------------------
    // افحص كل الحسابات
    // -------------------------------------------------------

    for (
      const account
      of accounts
    ) {

      const result =
        this.validateAccount(
          account
        );

      diagnostics.push(
        result
      );

      this._log(
        `👤 Account="${result.accountName}" | ` +
        `STATUS=${result.status} | ` +
        `COOKIE_COUNT=${result.cookieCount} | ` +
        `VALID=${result.valid} | ` +
        `REASON=${result.reason}`
      );

      // -----------------------------------------------------
      // حساب غير ACTIVE
      // -----------------------------------------------------

      if (
        result.status !== 'ACTIVE'
      ) {

        this._warn(
          `⏭️ Skipping "${result.accountName}" because status=${result.status}`
        );

        continue;
      }

      // -----------------------------------------------------
      // كوكيز غير صالحة
      // -----------------------------------------------------

      if (
        !result.valid
      ) {

        this._warn(
          `⏭️ Skipping "${result.accountName}": ${result.reason}`
        );

        if (
          result.missing.length > 0
        ) {
          this._warn(
            `⚠️ Missing: ${result.missing.join(', ')}`
          );
        }

        continue;
      }

      // -----------------------------------------------------
      // حساب صالح
      // -----------------------------------------------------

      this._log(
        `✅ VALID ACCOUNT FOUND: "${result.accountName}"`
      );

      this._log(
        `🍪 Cookies: ${result.cookieNames.join(', ')}`
      );

      return {
        document: account,
        accountName:
          result.accountName,
        cookies:
          result.cookies,
        diagnostics
      };
    }

    // -------------------------------------------------------
    // لا يوجد حساب صالح
    // -------------------------------------------------------

    this._error(
      '❌ ACTIVE accounts exist, but none contains a valid Facebook cookie set'
    );

    this.printDiagnostics(
      diagnostics
    );

    return null;
  }

  // =========================================================
  // PRINT DIAGNOSTICS
  // =========================================================

  printDiagnostics(
    diagnostics
  ) {

    console.log(
      '\n========== COOKIE ACCOUNT DIAGNOSTICS =========='
    );

    for (
      const item
      of diagnostics
    ) {

      console.log(
        `👤 ACCOUNT: ${item.accountName}`
      );

      console.log(
        `   STATUS: ${item.status}`
      );

      console.log(
        `   COOKIE COUNT: ${item.cookieCount}`
      );

      console.log(
        `   COOKIE NAMES: ${
          item.cookieNames.length
            ? item.cookieNames.join(', ')
            : '[NONE]'
        }`
      );

      console.log(
        `   VALID STRUCTURE: ${item.valid}`
      );

      console.log(
        `   REASON: ${item.reason}`
      );

      if (
        item.missing.length > 0
      ) {
        console.log(
          `   MISSING: ${item.missing.join(', ')}`
        );
      }

      console.log(
        `   LAST USED: ${
          item.lastUsedAt
            ? new Date(
                item.lastUsedAt
              ).toString()
            : 'NEVER'
        }`
      );

      console.log(
        '-----------------------------------------------'
      );
    }

    console.log(
      '=================================================\n'
    );
  }

  // =========================================================
  // ADD / UPDATE COOKIES
  // =========================================================

  async addCookies(
    accountName,
    cookies
  ) {

    if (
      !accountName ||
      !String(accountName).trim()
    ) {
      throw new Error(
        'ACCOUNT_NAME_ERROR: accountName is required'
      );
    }

    const normalized =
      this.normalizeCookies(
        cookies
      );

    if (
      normalized.length === 0
    ) {
      throw new Error(
        'COOKIE_ERROR: No valid cookies supplied'
      );
    }

    this._log(
      `🍪 Saving cookies for "${accountName}"`
    );

    const existing =
      await Cookie.findOne({
        accountName:
          String(accountName).trim()
      });

    if (existing) {

      existing.cookies =
        normalized;

      existing.status =
        'ACTIVE';

      existing.cooldownUntil =
        null;

      existing.lastUsedAt =
        new Date();

      existing.lastValidationAt =
        new Date();

      existing.lastValidationStatus =
        'VALID';

      existing.lastValidationReason =
        'UPDATED';

      await existing.save();

      this._log(
        `✅ Cookies updated for "${accountName}" (${normalized.length} cookies)`
      );

      return existing;
    }

    const doc =
      await Cookie.create({
        accountName:
          String(accountName).trim(),

        cookies:
          normalized,

        status:
          'ACTIVE',

        lastUsedAt:
          new Date(),

        lastValidationAt:
          new Date(),

        lastValidationStatus:
          'VALID',

        lastValidationReason:
          'ADDED'
      });

    this._log(
      `✅ Cookies added for "${accountName}" (${normalized.length} cookies)`
    );

    return doc;
  }

  // =========================================================
  // MARK ACCOUNT BLOCKED
  // =========================================================

  async blockCookie(
    cookieId,
    reason = 'Blocked'
  ) {

    try {

      const updated =
        await Cookie.findByIdAndUpdate(
          cookieId,
          {
            status: 'BLOCKED',

            cooldownUntil:
              new Date(
                Date.now() +
                30 * 60 * 1000
              ),

            lastValidationAt:
              new Date(),

            lastValidationStatus:
              'INVALID',

            lastValidationReason:
              reason
          },
          {
            new: true
          }
        );

      return updated;

    } catch (error) {

      this._error(
        `Error blocking cookie: ${error.message}`
      );

      return null;
    }
  }

  // =========================================================
  // MARK ACCOUNT EXPIRED
  // =========================================================

  async markExpired(
    cookieId,
    reason = 'Facebook session expired'
  ) {

    try {

      const updated =
        await Cookie.findByIdAndUpdate(
          cookieId,
          {
            status: 'EXPIRED',

            lastValidationAt:
              new Date(),

            lastValidationStatus:
              'INVALID',

            lastValidationReason:
              reason
          },
          {
            new: true
          }
        );

      return updated;

    } catch (error) {

      this._error(
        `Error marking expired: ${error.message}`
      );

      return null;
    }
  }

  // =========================================================
  // UPDATE USAGE
  // =========================================================

  async updateCookieUsage(
    cookieId
  ) {

    try {

      await Cookie.findByIdAndUpdate(
        cookieId,
        {
          lastUsedAt:
            new Date()
        }
      );

    } catch (error) {

      this._error(
        `Error updating usage: ${error.message}`
      );
    }
  }

  // =========================================================
  // DELETE ACCOUNT
  // =========================================================

  async deleteAccount(
    accountName
  ) {

    try {

      return await Cookie.findOneAndDelete({
        accountName
      });

    } catch (error) {

      this._error(
        `Error deleting account: ${error.message}`
      );

      throw error;
    }
  }

  // =========================================================
  // DELETE BLOCKED
  // =========================================================

  async deleteInactiveAccounts() {

    try {

      const result =
        await Cookie.deleteMany({
          status: 'BLOCKED'
        });

      this._log(
        `🗑️ Deleted ${result.deletedCount} BLOCKED account(s)`
      );

      return result;

    } catch (error) {

      this._error(
        `Error deleting inactive accounts: ${error.message}`
      );

      throw error;
    }
  }
}

module.exports =
  new CookieManagerService();
