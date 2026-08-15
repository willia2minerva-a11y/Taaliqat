// src/services/cookieManager.service.js

const Cookie = require('../models/Cookie');

class CookieManagerService {
  constructor() {
    // Facebook cookies المطلوبة لتسجيل الدخول
    this.requiredCookies = [
      'datr',
      'fr',
      'c_user',
      'xs'
    ];
  }

  // =========================================================
  // LOG
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
  // Normalize cookie input
  //
  // Supports:
  // - Array
  // - JSON string
  // - object containing cookies
  // =========================================================

  normalizeCookies(input) {
    let cookies = input;

    // -------------------------------------------------------
    // JSON string
    // -------------------------------------------------------

    if (typeof cookies === 'string') {
      try {
        cookies = JSON.parse(cookies);
      } catch {
        return [];
      }
    }

    // -------------------------------------------------------
    // Object wrappers
    // -------------------------------------------------------

    if (
      cookies &&
      !Array.isArray(cookies) &&
      typeof cookies === 'object'
    ) {
      if (Array.isArray(cookies.cookies)) {
        cookies = cookies.cookies;
      } else if (
        Array.isArray(cookies.data)
      ) {
        cookies = cookies.data;
      } else {
        cookies = [];
      }
    }

    if (!Array.isArray(cookies)) {
      return [];
    }

    // -------------------------------------------------------
    // Normalize each cookie
    // -------------------------------------------------------

    const result = [];

    for (const cookie of cookies) {
      if (!cookie || typeof cookie !== 'object') {
        continue;
      }

      if (!cookie.name) {
        continue;
      }

      if (
        cookie.value === undefined ||
        cookie.value === null
      ) {
        continue;
      }

      result.push({
        name: String(cookie.name).trim(),
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
          Boolean(cookie.httpOnly),

        ...(cookie.sameSite
          ? {
              sameSite:
                this._normalizeSameSite(
                  cookie.sameSite
                )
            }
          : {}),

        ...(cookie.expires !== undefined &&
        cookie.expires !== null &&
        Number(cookie.expires) > 0
          ? {
              expires:
                Number(cookie.expires)
            }
          : {})
      });
    }

    return result;
  }

  // =========================================================
  // SameSite normalization
  // =========================================================

  _normalizeSameSite(value) {
    const valueLower =
      String(value)
        .toLowerCase()
        .trim();

    if (valueLower === 'strict') {
      return 'Strict';
    }

    if (valueLower === 'none') {
      return 'None';
    }

    return 'Lax';
  }

  // =========================================================
  // Get cookie names
  // =========================================================

  getCookieNames(cookies) {
    if (!Array.isArray(cookies)) {
      return [];
    }

    return [
      ...new Set(
        cookies
          .filter(c => c && c.name)
          .map(c =>
            String(c.name).trim()
          )
      )
    ];
  }

  // =========================================================
  // Validate cookie account
  // =========================================================

  validateCookiesDetailed(cookies) {
    const normalized =
      this.normalizeCookies(cookies);

    // -------------------------------------------------------
    // Empty
    // -------------------------------------------------------

    if (normalized.length === 0) {
      return {
        valid: false,
        reason: 'COOKIES_EMPTY',
        cookieCount: 0,
        cookieNames: [],
        missing: [
          ...this.requiredCookies
        ],
        cookies: []
      };
    }

    // -------------------------------------------------------
    // Names
    // -------------------------------------------------------

    const names =
      this.getCookieNames(
        normalized
      );

    const missing =
      this.requiredCookies.filter(
        required =>
          !normalized.some(
            cookie =>
              cookie.name ===
                required &&
              String(
                cookie.value || ''
              ).trim() !== ''
          )
      );

    // -------------------------------------------------------
    // Missing required cookies
    // -------------------------------------------------------

    if (missing.length > 0) {
      return {
        valid: false,
        reason:
          'COOKIES_MISSING_REQUIRED',
        cookieCount:
          normalized.length,
        cookieNames:
          names,
        missing,
        cookies: normalized
      };
    }

    // -------------------------------------------------------
    // Valid
    // -------------------------------------------------------

    return {
      valid: true,
      reason: 'VALID',
      cookieCount:
        normalized.length,
      cookieNames:
        names,
      missing: [],
      cookies: normalized
    };
  }

  // =========================================================
  // Validate simple
  // =========================================================

  async validateCookies(cookies) {
    const result =
      this.validateCookiesDetailed(
        cookies
      );

    return result.valid;
  }

  // =========================================================
  // Get all accounts
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
        `Failed to load cookie accounts: ${error.message}`
      );

      return [];
    }
  }

  // =========================================================
  // Get all active accounts
  // =========================================================

  async getActiveAccounts() {
    try {
      const accounts =
        await Cookie.find({
          status: 'ACTIVE'
        }).sort({
          lastUsedAt: 1
        });

      this._log(
        `📊 Found ${accounts.length} ACTIVE account(s)`
      );

      return accounts;

    } catch (error) {
      this._error(
        `Failed to load ACTIVE accounts: ${error.message}`
      );

      return [];
    }
  }

  // =========================================================
  // Find valid active Facebook account
  // =========================================================

  async getValidActiveAccount() {
    this._log(
      '🔍 Searching for a valid ACTIVE Facebook account...'
    );

    const accounts =
      await this.getActiveAccounts();

    if (accounts.length === 0) {
      this._warn(
        '⚠️ No ACTIVE Facebook accounts found'
      );

      return null;
    }

    const diagnostics = [];

    for (const account of accounts) {
      // -----------------------------------------------------
      // Never display undefined
      // -----------------------------------------------------

      const accountName =
        account.accountName &&
        String(account.accountName).trim()
          ? String(
              account.accountName
            ).trim()
          : 'UNKNOWN';

      const validation =
        this.validateCookiesDetailed(
          account.cookies
        );

      this._log(
        `👤 Account="${accountName}" | ` +
        `STATUS=${account.status} | ` +
        `COOKIE_COUNT=${validation.cookieCount} | ` +
        `VALID=${validation.valid} | ` +
        `REASON=${validation.reason}`
      );

      if (validation.cookieNames.length > 0) {
        this._log(
          `   🍪 Cookies: ${validation.cookieNames.join(', ')}`
        );
      }

      if (
        validation.missing &&
        validation.missing.length > 0
      ) {
        this._log(
          `   ❌ Missing: ${validation.missing.join(', ')}`
        );
      }

      // -----------------------------------------------------
      // Invalid account
      // -----------------------------------------------------

      if (!validation.valid) {
        diagnostics.push({
          accountName,
          status:
            account.status,
          ...validation,
          lastUsedAt:
            account.lastUsedAt
        });

        this._warn(
          `⚠️ Skipping account "${accountName}": ${this._getReasonText(
            accountName,
            validation
          )}`
        );

        continue;
      }

      // -----------------------------------------------------
      // Valid account
      // -----------------------------------------------------

      this._log(
        `✅ VALID Facebook account selected: "${accountName}"`
      );

      return {
        document: account,

        accountName,

        cookies:
          validation.cookies,

        validation
      };
    }

    // -------------------------------------------------------
    // No valid account
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
  // Reason text
  // =========================================================

  _getReasonText(
    accountName,
    validation
  ) {
    if (
      validation.reason ===
      'COOKIES_EMPTY'
    ) {
      return `Account "${accountName}" is ACTIVE but cookie array is empty`;
    }

    if (
      validation.reason ===
      'COOKIES_MISSING_REQUIRED'
    ) {
      return (
        `Account "${accountName}" is missing required cookies: ` +
        validation.missing.join(', ')
      );
    }

    return `Account "${accountName}" has invalid cookies`;
  }

  // =========================================================
  // Print diagnostics
  // =========================================================

  printDiagnostics(
    diagnostics
  ) {
    console.log(
      '\n========== COOKIE ACCOUNT DIAGNOSTICS =========='
    );

    if (
      !diagnostics ||
      diagnostics.length === 0
    ) {
      console.log(
        'No account diagnostics available.'
      );
    }

    for (
      const diagnostic
      of diagnostics
    ) {
      console.log(
        `👤 ACCOUNT: ${diagnostic.accountName}`
      );

      console.log(
        `   STATUS: ${diagnostic.status}`
      );

      console.log(
        `   COOKIE COUNT: ${diagnostic.cookieCount}`
      );

      console.log(
        `   COOKIE NAMES: ${
          diagnostic.cookieNames.length
            ? diagnostic.cookieNames.join(', ')
            : '[NONE]'
        }`
      );

      console.log(
        `   VALID STRUCTURE: ${diagnostic.valid}`
      );

      console.log(
        `   REASON: ${diagnostic.reason}`
      );

      if (
        diagnostic.missing &&
        diagnostic.missing.length
      ) {
        console.log(
          `   MISSING: ${diagnostic.missing.join(', ')}`
        );
      }

      console.log(
        `   LAST USED: ${
          diagnostic.lastUsedAt
            ? diagnostic.lastUsedAt
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
  // Add / update cookies
  // =========================================================

  async addCookies(
    accountName,
    cookies
  ) {
    try {
      const cleanName =
        String(
          accountName || ''
        ).trim();

      // -----------------------------------------------------
      // Account name validation
      // -----------------------------------------------------

      if (
        !cleanName ||
        cleanName.toLowerCase() ===
          'undefined' ||
        cleanName.toLowerCase() ===
          'null'
      ) {
        throw new Error(
          'COOKIE_IMPORT_ERROR: accountName is required'
        );
      }

      // -----------------------------------------------------
      // Normalize
      // -----------------------------------------------------

      const normalized =
        this.normalizeCookies(
          cookies
        );

      // -----------------------------------------------------
      // Detailed validation
      // -----------------------------------------------------

      const validation =
        this.validateCookiesDetailed(
          normalized
        );

      this._log(
        `🍪 Importing cookies for account "${cleanName}"`
      );

      this._log(
        `   COOKIE_COUNT=${validation.cookieCount}`
      );

      this._log(
        `   COOKIE_NAMES=${
          validation.cookieNames.join(', ') ||
          '[NONE]'
        }`
      );

      // -----------------------------------------------------
      // NEVER save incomplete Facebook cookies as ACTIVE
      // -----------------------------------------------------

      if (!validation.valid) {
        throw new Error(
          `COOKIE_IMPORT_ERROR: Invalid Facebook cookie set. Reason=${validation.reason}. Missing=${validation.missing.join(', ')}`
        );
      }

      // -----------------------------------------------------
      // Existing
      // -----------------------------------------------------

      let existing =
        await Cookie.findOne({
          accountName: cleanName
        });

      if (existing) {
        existing.cookies =
          validation.cookies;

        existing.status =
          'ACTIVE';

        existing.cooldownUntil =
          null;

        existing.lastUsedAt =
          new Date();

        await existing.save();

        this._log(
          `✅ Cookies updated successfully for "${cleanName}"`
        );

        return existing;
      }

      // -----------------------------------------------------
      // New account
      // -----------------------------------------------------

      const created =
        await Cookie.create({
          accountName:
            cleanName,

          cookies:
            validation.cookies,

          status:
            'ACTIVE',

          cooldownUntil:
            null,

          lastUsedAt:
            new Date()
        });

      this._log(
        `✅ New Facebook cookie account created: "${cleanName}"`
      );

      return created;

    } catch (error) {
      this._error(
        `❌ Failed to add cookies: ${error.message}`
      );

      throw error;
    }
  }

  // =========================================================
  // Block account
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
            status:
              'BLOCKED',

            cooldownUntil:
              new Date(
                Date.now() +
                  30 *
                    60 *
                    1000
              )
          },
          {
            new: true
          }
        );

      if (updated) {
        this._warn(
          `🚫 Account "${updated.accountName}" blocked. Reason: ${reason}`
        );
      }

      return updated;

    } catch (error) {
      this._error(
        `Failed to block account: ${error.message}`
      );

      throw error;
    }
  }

  // =========================================================
  // Unblock
  // =========================================================

  async unblockCookie(
    cookieId
  ) {
    try {
      const updated =
        await Cookie.findByIdAndUpdate(
          cookieId,
          {
            status:
              'ACTIVE',

            cooldownUntil:
              null
          },
          {
            new: true
          }
        );

      if (updated) {
        this._log(
          `🔓 Account "${updated.accountName}" activated`
        );
      }

      return updated;

    } catch (error) {
      this._error(
        `Failed to unblock account: ${error.message}`
      );

      throw error;
    }
  }

  // =========================================================
  // Update usage
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
        `Failed to update cookie usage: ${error.message}`
      );
    }
  }

  // =========================================================
  // Delete account
  // =========================================================

  async deleteAccount(
    accountName
  ) {
    try {
      const result =
        await Cookie.findOneAndDelete({
          accountName
        });

      if (result) {
        this._log(
          `🗑️ Deleted account "${accountName}"`
        );
      }

      return result;

    } catch (error) {
      this._error(
        `Failed to delete account: ${error.message}`
      );

      throw error;
    }
  }

  // =========================================================
  // Delete invalid accounts
  //
  // DOES NOT delete automatically.
  // Returns list only.
  // =========================================================

  async findInvalidAccounts() {
    const accounts =
      await Cookie.find({});

    const invalid = [];

    for (const account of accounts) {
      const validation =
        this.validateCookiesDetailed(
          account.cookies
        );

      if (
        !validation.valid
      ) {
        invalid.push({
          id: account._id,
          accountName:
            account.accountName ||
            'UNKNOWN',
          status:
            account.status,
          ...validation
        });
      }
    }

    return invalid;
  }
}

module.exports =
  new CookieManagerService();
