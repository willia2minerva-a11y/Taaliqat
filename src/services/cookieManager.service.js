// src/services/cookieManager.service.js

const Cookie = require('../models/Cookie');

class CookieManagerService {

  // =========================================================
  // LOGGING
  // =========================================================

  _log(message) {
    console.log(`[COOKIE-MANAGER] ${message}`);
  }

  _warn(message) {
    console.warn(`[COOKIE-MANAGER][WARN] ${message}`);
  }

  _error(message, error = null) {
    console.error(
      `[COOKIE-MANAGER][ERROR] ${message}${
        error?.message ? `: ${error.message}` : ''
      }`
    );

    if (error?.stack) {
      console.error(error.stack);
    }
  }

  // =========================================================
  // COOKIE STRUCTURE
  // =========================================================

  _getCookieInfo(cookies) {
    return {
      isArray: Array.isArray(cookies),
      count: Array.isArray(cookies)
        ? cookies.length
        : null
    };
  }

  _getCookieNames(cookies) {
    if (!Array.isArray(cookies)) {
      return [];
    }

    return cookies
      .filter(cookie => cookie && cookie.name)
      .map(cookie => String(cookie.name));
  }

  _getMissingRequiredCookies(cookies) {
    const required = [
      'datr',
      'fr',
      'c_user',
      'xs'
    ];

    if (!Array.isArray(cookies)) {
      return required;
    }

    return required.filter(name => {
      return !cookies.some(cookie => {
        return (
          cookie &&
          String(cookie.name) === name &&
          cookie.value !== undefined &&
          cookie.value !== null &&
          String(cookie.value).trim() !== ''
        );
      });
    });
  }

  _validateCookieArray(cookies, accountName = 'UNKNOWN') {

    if (cookies === null) {
      return {
        valid: false,
        reason: 'COOKIES_NULL',
        message:
          `Account "${accountName}" has cookies = null`
      };
    }

    if (cookies === undefined) {
      return {
        valid: false,
        reason: 'COOKIES_UNDEFINED',
        message:
          `Account "${accountName}" has cookies = undefined`
      };
    }

    if (!Array.isArray(cookies)) {
      return {
        valid: false,
        reason: 'COOKIES_NOT_ARRAY',
        message:
          `Account "${accountName}" cookies field is not an array`
      };
    }

    if (cookies.length === 0) {
      return {
        valid: false,
        reason: 'COOKIES_EMPTY',
        message:
          `Account "${accountName}" is ACTIVE but cookie array is empty`
      };
    }

    const validCookies =
      cookies.filter(cookie => {
        return (
          cookie &&
          cookie.name &&
          cookie.value !== undefined &&
          cookie.value !== null &&
          String(cookie.value).trim() !== ''
        );
      });

    if (validCookies.length === 0) {
      return {
        valid: false,
        reason: 'COOKIES_INVALID',
        message:
          `Account "${accountName}" contains no valid cookie objects`
      };
    }

    const missing =
      this._getMissingRequiredCookies(
        cookies
      );

    if (missing.length > 0) {
      return {
        valid: false,
        reason: 'COOKIES_MISSING_REQUIRED',
        message:
          `Account "${accountName}" is missing required cookies: ${missing.join(', ')}`,
        missing
      };
    }

    return {
      valid: true,
      reason: 'OK',
      message:
        `Account "${accountName}" has a valid cookie structure`,
      missing: []
    };
  }

  // =========================================================
  // GET ALL ACCOUNTS
  // =========================================================

  async getAllCookies() {
    try {

      const cookies =
        await Cookie.find({})
          .sort({
            status: 1,
            lastUsedAt: 1
          });

      this._log(
        `📊 Found ${cookies.length} cookie account(s)`
      );

      for (const account of cookies) {

        const validation =
          this._validateCookieArray(
            account.cookies,
            account.accountName
          );

        this._log(
          `👤 ${account.accountName} | ` +
          `STATUS=${account.status} | ` +
          `COOKIES=${
            Array.isArray(account.cookies)
              ? account.cookies.length
              : 'NOT_ARRAY'
          } | ` +
          `VALID=${validation.valid} | ` +
          `REASON=${validation.reason}`
        );
      }

      return cookies;

    } catch (error) {

      this._error(
        'Failed to fetch cookie accounts',
        error
      );

      return [];
    }
  }

  // =========================================================
  // GET VALID ACTIVE COOKIE DOCUMENT
  // =========================================================

  async getActiveCookieDocument() {

    try {

      this._log(
        '🔍 Searching for a valid ACTIVE Facebook account...'
      );

      const accounts =
        await Cookie.find({
          status: 'ACTIVE'
        })
        .sort({
          lastUsedAt: 1
        });

      if (!accounts.length) {

        this._error(
          '❌ No ACTIVE cookie accounts found in MongoDB'
        );

        await this._printAccountDiagnostics();

        return null;
      }

      this._log(
        `📊 Found ${accounts.length} ACTIVE account(s)`
      );

      for (const account of accounts) {

        const validation =
          this._validateCookieArray(
            account.cookies,
            account.accountName
          );

        const cookieCount =
          Array.isArray(account.cookies)
            ? account.cookies.length
            : 'NOT_ARRAY';

        this._log(
          `👤 Account="${account.accountName}" | ` +
          `STATUS=${account.status} | ` +
          `COOKIE_COUNT=${cookieCount} | ` +
          `VALID=${validation.valid} | ` +
          `REASON=${validation.reason}`
        );

        if (!validation.valid) {

          this._warn(
            `⚠️ Skipping account "${account.accountName}": ${validation.message}`
          );

          if (
            validation.missing &&
            validation.missing.length > 0
          ) {
            this._warn(
              `⚠️ Missing: ${validation.missing.join(', ')}`
            );
          }

          continue;
        }

        const names =
          this._getCookieNames(
            account.cookies
          );

        this._log(
          `🍪 Account "${account.accountName}" cookies: ${names.join(', ')}`
        );

        this._log(
          `✅ Selected ACTIVE account: ${account.accountName}`
        );

        return account;
      }

      this._error(
        '❌ ACTIVE accounts exist, but none contains a valid Facebook cookie set'
      );

      await this._printAccountDiagnostics();

      return null;

    } catch (error) {

      this._error(
        'Failed while selecting active cookie account',
        error
      );

      return null;
    }
  }

  // =========================================================
  // GET ACTIVE COOKIES ONLY
  // =========================================================

  async getActiveCookies() {

    const account =
      await this.getActiveCookieDocument();

    if (!account) {
      return null;
    }

    return account.cookies;
  }

  // =========================================================
  // ACCOUNT DIAGNOSTICS
  // =========================================================

  async _printAccountDiagnostics() {

    try {

      const accounts =
        await Cookie.find({})
          .select(
            'accountName status cookies lastUsedAt'
          )
          .sort({
            lastUsedAt: 1
          });

      console.log(
        '\n========== COOKIE ACCOUNT DIAGNOSTICS =========='
      );

      if (!accounts.length) {

        console.log(
          '❌ MongoDB contains ZERO cookie accounts'
        );

      } else {

        for (const account of accounts) {

          const validation =
            this._validateCookieArray(
              account.cookies,
              account.accountName
            );

          const count =
            Array.isArray(account.cookies)
              ? account.cookies.length
              : 'NOT_ARRAY';

          const names =
            this._getCookieNames(
              account.cookies
            );

          console.log(
            `👤 ACCOUNT: ${account.accountName}`
          );

          console.log(
            `   STATUS: ${account.status}`
          );

          console.log(
            `   COOKIE COUNT: ${count}`
          );

          console.log(
            `   COOKIE NAMES: ${
              names.length
                ? names.join(', ')
                : '[NONE]'
            }`
          );

          console.log(
            `   VALID STRUCTURE: ${validation.valid}`
          );

          console.log(
            `   REASON: ${validation.reason}`
          );

          if (
            validation.missing &&
            validation.missing.length
          ) {
            console.log(
              `   MISSING: ${validation.missing.join(', ')}`
            );
          }

          console.log(
            `   LAST USED: ${
              account.lastUsedAt || 'NEVER'
            }`
          );

          console.log(
            '-----------------------------------------------'
          );
        }
      }

      console.log(
        '=================================================\n'
      );

    } catch (error) {

      this._error(
        'Could not print account diagnostics',
        error
      );
    }
  }

  // =========================================================
  // ADD / UPDATE COOKIES
  // =========================================================

  async addCookies(accountName, cookies) {

    try {

      if (
        !accountName ||
        !String(accountName).trim()
      ) {
        throw new Error(
          'accountName is required'
        );
      }

      const validation =
        this._validateCookieArray(
          cookies,
          accountName
        );

      if (!validation.valid) {

        throw new Error(
          validation.message
        );
      }

      this._log(
        `🍪 Adding/updating cookies for: ${accountName}`
      );

      const existing =
        await Cookie.findOne({
          accountName
        });

      if (existing) {

        existing.cookies =
          cookies;

        existing.status =
          'ACTIVE';

        existing.cooldownUntil =
          null;

        existing.lastUsedAt =
          new Date();

        await existing.save();

        this._log(
          `✅ Cookies updated for: ${accountName} (${cookies.length} cookies)`
        );

        return existing;
      }

      const cookieDoc =
        new Cookie({
          accountName,
          cookies,
          status: 'ACTIVE',
          cooldownUntil: null,
          lastUsedAt: new Date()
        });

      await cookieDoc.save();

      this._log(
        `✅ Cookies added: ${accountName} (${cookies.length} cookies)`
      );

      return cookieDoc;

    } catch (error) {

      this._error(
        `Failed adding cookies for "${accountName}"`,
        error
      );

      throw error;
    }
  }

  // =========================================================
  // VALIDATE COOKIES
  // =========================================================

  async validateCookies(cookies) {

    const validation =
      this._validateCookieArray(
        cookies,
        'VALIDATION'
      );

    if (!validation.valid) {

      this._warn(
        `❌ Cookie validation failed: ${validation.message}`
      );

      return false;
    }

    this._log(
      '✅ Cookie validation passed'
    );

    return true;
  }

  // =========================================================
  // BLOCK COOKIE ACCOUNT
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
              )
          },
          {
            new: true
          }
        );

      if (updated) {

        this._warn(
          `🚫 Account "${updated.accountName}" blocked: ${reason}`
        );
      }

      return updated;

    } catch (error) {

      this._error(
        'Error blocking cookie account',
        error
      );

      throw error;
    }
  }

  // =========================================================
  // UNBLOCK COOKIE ACCOUNT
  // =========================================================

  async unblockCookie(cookieId) {

    try {

      const updated =
        await Cookie.findByIdAndUpdate(
          cookieId,
          {
            status: 'ACTIVE',
            cooldownUntil: null
          },
          {
            new: true
          }
        );

      if (updated) {

        this._log(
          `🔓 Account "${updated.accountName}" is ACTIVE again`
        );
      }

      return updated;

    } catch (error) {

      this._error(
        'Error unblocking cookie account',
        error
      );

      throw error;
    }
  }

  // =========================================================
  // UPDATE USAGE
  // =========================================================

  async updateCookieUsage(cookieId) {

    try {

      await Cookie.findByIdAndUpdate(
        cookieId,
        {
          lastUsedAt: new Date()
        }
      );

      this._log(
        `🔄 Cookie account usage updated: ${cookieId}`
      );

    } catch (error) {

      this._error(
        'Error updating cookie usage',
        error
      );
    }
  }

  // =========================================================
  // DELETE ACCOUNT
  // =========================================================

  async deleteAccount(accountName) {

    try {

      const result =
        await Cookie.findOneAndDelete({
          accountName
        });

      if (result) {

        this._log(
          `🗑️ Deleted cookie account: ${accountName}`
        );
      }

      return result;

    } catch (error) {

      this._error(
        `Error deleting account "${accountName}"`,
        error
      );

      throw error;
    }
  }

  // =========================================================
  // DELETE BLOCKED ACCOUNTS
  // =========================================================

  async deleteInactiveAccounts() {

    try {

      const result =
        await Cookie.deleteMany({
          status: 'BLOCKED'
        });

      this._log(
        `🗑️ Deleted ${result.deletedCount || 0} BLOCKED account(s)`
      );

      return result;

    } catch (error) {

      this._error(
        'Error deleting inactive accounts',
        error
      );

      throw error;
    }
  }
}

module.exports =
  new CookieManagerService();
