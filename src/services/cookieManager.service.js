// src/services/cookieManager.service.js

const Cookie = require('../models/Cookie');

class CookieManagerService {

  // =========================================================
  // REQUIRED FACEBOOK COOKIES
  // =========================================================

  _getRequiredCookies() {
    return [
      'datr',
      'fr',
      'c_user',
      'xs'
    ];
  }

  // =========================================================
  // NORMALIZE ACCOUNT NAME
  // =========================================================

  _getAccountName(doc) {
    if (
      doc &&
      doc.accountName &&
      String(doc.accountName).trim()
    ) {
      return String(
        doc.accountName
      ).trim();
    }

    return 'UNKNOWN';
  }

  // =========================================================
  // GET COOKIE NAMES
  // =========================================================

  _getCookieNames(cookies) {
    if (!Array.isArray(cookies)) {
      return [];
    }

    return cookies
      .filter(cookie => cookie && cookie.name)
      .map(cookie => String(cookie.name));
  }

  // =========================================================
  // VALIDATE COOKIE STRUCTURE
  // =========================================================

  validateCookiesDetailed(cookies) {

    const required =
      this._getRequiredCookies();

    // -------------------------------------------------------
    // Empty
    // -------------------------------------------------------

    if (!Array.isArray(cookies)) {
      return {
        valid: false,
        reason: 'COOKIES_NOT_ARRAY',
        missing: required,
        count: 0
      };
    }

    if (cookies.length === 0) {
      return {
        valid: false,
        reason: 'COOKIES_EMPTY',
        missing: required,
        count: 0
      };
    }

    // -------------------------------------------------------
    // Build valid names
    // -------------------------------------------------------

    const names =
      new Set();

    for (const cookie of cookies) {

      if (!cookie) {
        continue;
      }

      if (
        !cookie.name ||
        cookie.value === undefined ||
        cookie.value === null ||
        String(cookie.value).trim() === ''
      ) {
        continue;
      }

      names.add(
        String(cookie.name).trim()
      );
    }

    const missing =
      required.filter(
        name => !names.has(name)
      );

    // -------------------------------------------------------
    // Missing required
    // -------------------------------------------------------

    if (missing.length > 0) {
      return {
        valid: false,
        reason: 'COOKIES_MISSING_REQUIRED',
        missing,
        count: cookies.length,
        names: [...names]
      };
    }

    // -------------------------------------------------------
    // Valid
    // -------------------------------------------------------

    return {
      valid: true,
      reason: 'VALID',
      missing: [],
      count: cookies.length,
      names: [...names]
    };
  }

  // =========================================================
  // SIMPLE VALIDATE
  // =========================================================

  async validateCookies(cookies) {

    const result =
      this.validateCookiesDetailed(
        cookies
      );

    return result.valid;
  }

  // =========================================================
  // GET ALL COOKIES
  // =========================================================

  async getAllCookies() {

    try {

      const accounts =
        await Cookie.find({})
          .sort({
            lastUsedAt: 1
          });

      console.log(
        `[COOKIE-MANAGER] 📊 Found ${accounts.length} cookie account(s)`
      );

      return accounts;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ Failed to load accounts: ${error.message}`
      );

      return [];
    }
  }

  // =========================================================
  // PRINT ACCOUNT DIAGNOSTICS
  // =========================================================

  _printAccountDiagnostic(
    account,
    validation
  ) {

    const accountName =
      this._getAccountName(account);

    const cookies =
      Array.isArray(account?.cookies)
        ? account.cookies
        : [];

    const names =
      this._getCookieNames(
        cookies
      );

    console.log(
      '-----------------------------------------------'
    );

    console.log(
      `👤 ACCOUNT: ${accountName}`
    );

    console.log(
      `   STATUS: ${account?.status || 'UNKNOWN'}`
    );

    console.log(
      `   COOKIE COUNT: ${cookies.length}`
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
      validation.missing.length > 0
    ) {
      console.log(
        `   MISSING: ${validation.missing.join(', ')}`
      );
    }

    console.log(
      `   LAST USED: ${
        account?.lastUsedAt
          ? account.lastUsedAt.toString()
          : 'NEVER'
      }`
    );

    if (account?.lastError) {
      console.log(
        `   LAST ERROR: ${account.lastError}`
      );
    }
  }

  // =========================================================
  // CLEAN INVALID DATABASE ACCOUNTS
  // =========================================================

  async cleanupInvalidAccounts() {

    try {

      const accounts =
        await Cookie.find({});

      let deleted = 0;

      for (const account of accounts) {

        const accountName =
          this._getAccountName(
            account
          );

        // ---------------------------------------------------
        // Missing account name
        // ---------------------------------------------------

        if (
          !account.accountName ||
          !String(account.accountName).trim()
        ) {

          console.warn(
            `[COOKIE-MANAGER][WARN] ⚠️ Removing account with missing accountName`
          );

          await Cookie.deleteOne({
            _id: account._id
          });

          deleted++;

          continue;
        }

        // ---------------------------------------------------
        // Empty cookies
        // ---------------------------------------------------

        const cookies =
          Array.isArray(account.cookies)
            ? account.cookies
            : [];

        if (
          cookies.length === 0
        ) {

          console.warn(
            `[COOKIE-MANAGER][WARN] ⚠️ Removing "${accountName}" because cookie array is empty`
          );

          await Cookie.deleteOne({
            _id: account._id
          });

          deleted++;

          continue;
        }
      }

      if (deleted > 0) {

        console.log(
          `[COOKIE-MANAGER] 🧹 Removed ${deleted} invalid account(s)`
        );
      }

      return deleted;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ Cleanup failed: ${error.message}`
      );

      return 0;
    }
  }

  // =========================================================
  // GET VALID ACTIVE ACCOUNT
  // =========================================================

  async getValidActiveAccount() {

    console.log(
      '[COOKIE-MANAGER] 🔍 Searching for a valid ACTIVE Facebook account...'
    );

    try {

      const accounts =
        await Cookie.find({
          status: 'ACTIVE'
        })
        .sort({
          lastUsedAt: 1
        });

      console.log(
        `[COOKIE-MANAGER] 📊 Found ${accounts.length} ACTIVE account(s)`
      );

      if (
        accounts.length === 0
      ) {

        console.warn(
          '[COOKIE-MANAGER][WARN] ⚠️ No ACTIVE Facebook accounts'
        );

        return null;
      }

      for (
        const account
        of accounts
      ) {

        const accountName =
          this._getAccountName(
            account
          );

        const validation =
          this.validateCookiesDetailed(
            account.cookies
          );

        this._printAccountDiagnostic(
          account,
          validation
        );

        // ---------------------------------------------------
        // INVALID COOKIE STRUCTURE
        // ---------------------------------------------------

        if (!validation.valid) {

          console.warn(
            `[COOKIE-MANAGER][WARN] ⚠️ Skipping "${accountName}": ${validation.reason}`
          );

          if (
            validation.missing &&
            validation.missing.length > 0
          ) {

            console.warn(
              `[COOKIE-MANAGER][WARN] ⚠️ Missing: ${validation.missing.join(', ')}`
            );
          }

          // -------------------------------------------------
          // Empty / corrupted account
          //
          // Delete it completely.
          // -------------------------------------------------

          if (
            validation.reason ===
              'COOKIES_EMPTY' ||
            validation.reason ===
              'COOKIES_NOT_ARRAY'
          ) {

            console.warn(
              `[COOKIE-MANAGER] 🗑️ Deleting invalid account "${accountName}"`
            );

            await Cookie.deleteOne({
              _id: account._id
            });

          } else {

            // ------------------------------------------------
            // Cookie exists but incomplete.
            //
            // Do NOT stop the worker.
            // Mark it EXPIRED so it will be skipped.
            // ------------------------------------------------

            account.status =
              'EXPIRED';

            account.lastError =
              `Invalid cookie set: ${validation.reason}${
                validation.missing?.length
                  ? ` | Missing: ${validation.missing.join(', ')}`
                  : ''
              }`;

            account.lastCheckedAt =
              new Date();

            await account.save();

            console.warn(
              `[COOKIE-MANAGER] ⚠️ Account "${accountName}" marked EXPIRED and skipped`
            );
          }

          // Move to next account
          continue;
        }

        // ---------------------------------------------------
        // VALID ACCOUNT
        // ---------------------------------------------------

        console.log(
          `[COOKIE-MANAGER] ✅ VALID ACCOUNT FOUND: "${accountName}"`
        );

        console.log(
          `[COOKIE-MANAGER] 🍪 Cookie count: ${validation.count}`
        );

        return account;
      }

      // -----------------------------------------------------
      // No valid account
      // -----------------------------------------------------

      console.warn(
        '[COOKIE-MANAGER][WARN] ⚠️ No valid ACTIVE cookie account remains'
      );

      return null;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ Error searching cookie accounts: ${error.message}`
      );

      return null;
    }
  }

  // =========================================================
  // GET VALID ACTIVE COOKIES
  // =========================================================

  async getActiveCookies() {

    const account =
      await this.getValidActiveAccount();

    if (!account) {
      return null;
    }

    return account.cookies;
  }

  // =========================================================
  // MARK ACCOUNT EXPIRED
  // =========================================================

  async markExpired(
    accountId,
    reason = 'Facebook cookies expired'
  ) {

    try {

      const account =
        await Cookie.findById(
          accountId
        );

      if (!account) {
        return null;
      }

      account.status =
        'EXPIRED';

      account.lastError =
        String(reason);

      account.lastCheckedAt =
        new Date();

      await account.save();

      console.warn(
        `[COOKIE-MANAGER] 🟠 Account "${this._getAccountName(account)}" marked EXPIRED`
      );

      console.warn(
        `[COOKIE-MANAGER] Reason: ${reason}`
      );

      return account;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ markExpired failed: ${error.message}`
      );

      return null;
    }
  }

  // =========================================================
  // MARK ACCOUNT BLOCKED
  // =========================================================

  async markBlocked(
    accountId,
    reason = 'Facebook account blocked'
  ) {

    try {

      const account =
        await Cookie.findById(
          accountId
        );

      if (!account) {
        return null;
      }

      account.status =
        'BLOCKED';

      account.lastError =
        String(reason);

      account.lastCheckedAt =
        new Date();

      account.cooldownUntil =
        new Date(
          Date.now() +
          30 * 60 * 1000
        );

      await account.save();

      console.warn(
        `[COOKIE-MANAGER] 🔴 Account "${this._getAccountName(account)}" marked BLOCKED`
      );

      console.warn(
        `[COOKIE-MANAGER] Reason: ${reason}`
      );

      return account;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ markBlocked failed: ${error.message}`
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
          lastUsedAt: new Date(),
          lastCheckedAt: new Date()
        }
      );

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ Failed to update usage: ${error.message}`
      );
    }
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

    const validation =
      this.validateCookiesDetailed(
        cookies
      );

    if (!validation.valid) {

      throw new Error(
        `COOKIE_ERROR: Invalid cookie set: ${validation.reason}${
          validation.missing?.length
            ? ` | Missing: ${validation.missing.join(', ')}`
            : ''
        }`
      );
    }

    const cleanName =
      String(
        accountName
      ).trim();

    try {

      let existing =
        await Cookie.findOne({
          accountName: cleanName
        });

      if (existing) {

        existing.cookies =
          cookies;

        existing.status =
          'ACTIVE';

        existing.lastError =
          null;

        existing.cooldownUntil =
          null;

        existing.lastCheckedAt =
          new Date();

        existing.lastUsedAt =
          new Date();

        await existing.save();

        console.log(
          `[COOKIE-MANAGER] ✅ Cookies updated: "${cleanName}"`
        );

        return existing;
      }

      const cookieDoc =
        await Cookie.create({
          accountName: cleanName,
          cookies,
          status: 'ACTIVE',
          lastError: null,
          lastCheckedAt: new Date(),
          lastUsedAt: new Date()
        });

      console.log(
        `[COOKIE-MANAGER] ✅ Cookies added: "${cleanName}"`
      );

      return cookieDoc;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ Failed to add cookies: ${error.message}`
      );

      throw error;
    }
  }

  // =========================================================
  // BLOCK COOKIE
  // =========================================================

  async blockCookie(
    cookieId,
    reason = 'Blocked'
  ) {

    return this.markBlocked(
      cookieId,
      reason
    );
  }

  // =========================================================
  // UNBLOCK
  // =========================================================

  async unblockCookie(
    cookieId
  ) {

    try {

      const updated =
        await Cookie.findByIdAndUpdate(
          cookieId,
          {
            status: 'ACTIVE',
            cooldownUntil: null,
            lastError: null,
            lastCheckedAt: new Date()
          },
          {
            new: true
          }
        );

      return updated;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ Unblock failed: ${error.message}`
      );

      throw error;
    }
  }

  // =========================================================
  // DELETE ACCOUNT
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

        console.log(
          `[COOKIE-MANAGER] 🗑️ Account deleted: "${accountName}"`
        );
      }

      return result;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ Delete account failed: ${error.message}`
      );

      throw error;
    }
  }

  // =========================================================
  // DELETE BLOCKED / EXPIRED
  // =========================================================

  async deleteInactiveAccounts() {

    try {

      const result =
        await Cookie.deleteMany({
          status: {
            $in: [
              'BLOCKED',
              'EXPIRED'
            ]
          }
        });

      console.log(
        `[COOKIE-MANAGER] 🧹 Deleted ${result.deletedCount} inactive account(s)`
      );

      return result;

    } catch (error) {

      console.error(
        `[COOKIE-MANAGER][ERROR] ❌ Failed deleting inactive accounts: ${error.message}`
      );

      throw error;
    }
  }
}

module.exports =
  new CookieManagerService();
