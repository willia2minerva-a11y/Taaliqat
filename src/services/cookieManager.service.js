const Cookie = require('../models/Cookie');

class CookieManagerService {

  requiredCookies = ['datr', 'fr', 'c_user', 'xs'];

  // =========================================================
  // ✅ PARSE COOKIE STRING
  // =========================================================

  parseCookieString(cookieString) {
    if (typeof cookieString !== 'string') {
      return [];
    }

    const cookies = [];
    const pairs = cookieString.split(';').map(p => p.trim()).filter(Boolean);

    console.log(`[COOKIE-MANAGER] 🔍 Parsing ${pairs.length} cookie pairs`);

    for (const pair of pairs) {
      const equalIndex = pair.indexOf('=');
      if (equalIndex <= 0) {
        console.warn(`[COOKIE-MANAGER] ⚠️ Invalid cookie pair: ${pair.substring(0, 50)}`);
        continue;
      }

      const name = pair.substring(0, equalIndex).trim();
      const value = pair.substring(equalIndex + 1).trim();

      if (!name || !value) continue;

      cookies.push({
        name,
        value,
        domain: '.facebook.com',
        path: '/',
        secure: true,
        httpOnly: false,
        sameSite: 'Lax'
      });
    }

    console.log(`[COOKIE-MANAGER] ✅ Extracted ${cookies.length} cookies`);
    return cookies;
  }

  // =========================================================
  // ✅ VALIDATE COOKIES
  // =========================================================

  validateCookies(cookies) {
    if (!Array.isArray(cookies) || cookies.length === 0) {
      return { valid: false, reason: 'COOKIES_EMPTY', missing: [...this.requiredCookies], cookieCount: 0 };
    }

    const names = new Set(cookies.map(c => c?.name).filter(Boolean));
    const missing = this.requiredCookies.filter(name => !names.has(name));

    if (missing.length > 0) {
      return { valid: false, reason: 'COOKIES_MISSING_REQUIRED', missing, cookieCount: cookies.length };
    }

    const invalid = cookies.filter(c => !c?.name || !c?.value);
    if (invalid.length > 0) {
      return { valid: false, reason: 'COOKIES_WITHOUT_VALUE', missing: [], cookieCount: cookies.length };
    }

    return { valid: true, reason: 'VALID', missing: [], cookieCount: cookies.length };
  }

  // =========================================================
  // ✅ ADD COOKIES (مع findOneAndUpdate + فحص MongoDB مباشرة)
  // =========================================================

  async addCookies(accountName, cookieInput) {
    console.log('\n════════════════════════════════════════════');
    console.log('🍪 COOKIE SAVE DEBUG');
    console.log('════════════════════════════════════════════');
    console.log('👤 Account:', accountName);
    console.log('📦 Input type:', typeof cookieInput);
    console.log('📦 Is Array:', Array.isArray(cookieInput));
    console.log('📏 Input length:', cookieInput?.length);

    if (!accountName || !String(accountName).trim()) {
      throw new Error('ACCOUNT_NAME_REQUIRED');
    }

    let cookiesArray = [];

    if (typeof cookieInput === 'string') {
      const raw = cookieInput.trim();
      console.log('📏 Raw cookie length:', raw.length);
      console.log('🔎 Raw cookie preview:', raw.substring(0, 120) + (raw.length > 120 ? '...' : ''));

      const rawPairs = raw.split(';').map(x => x.trim()).filter(Boolean);
      console.log('🔢 Raw cookie pairs:', rawPairs.length);
      console.log('🏷️ Raw cookie names:', rawPairs.map(x => {
        const index = x.indexOf('=');
        return index > 0 ? x.substring(0, index).trim() : x;
      }).join(', '));

      cookiesArray = this.parseCookieString(raw);

    } else if (Array.isArray(cookieInput)) {
      console.log('📦 Received cookie array length:', cookieInput.length);
      cookiesArray = cookieInput.filter(c => c && c.name && c.value).map(c => ({
        name: String(c.name).trim(),
        value: String(c.value),
        domain: c.domain || '.facebook.com',
        path: c.path || '/',
        secure: c.secure !== false,
        httpOnly: Boolean(c.httpOnly),
        sameSite: c.sameSite || 'Lax',
        ...(c.expires ? { expires: Number(c.expires) } : {})
      }));
    } else {
      throw new Error('COOKIE_ERROR: Invalid cookie format. Expected string or array.');
    }

    console.log('────────────────────────────────────────────');
    console.log('🍪 Parsed cookie count:', cookiesArray.length);
    console.log('🏷️ Parsed names:', cookiesArray.map(c => c.name).join(', '));
    console.log('────────────────────────────────────────────');

    if (!cookiesArray.length) {
      throw new Error('COOKIE_ERROR: No valid cookies extracted');
    }

    const check = this.validateCookies(cookiesArray);
    console.log('🔍 Validation result:', JSON.stringify(check, null, 2));

    if (!check.valid) {
      console.error(`[COOKIE-MANAGER] ❌ Cookie validation failed: ${check.reason}`);
      if (check.missing?.length) {
        console.error(`[COOKIE-MANAGER] ❌ Missing: ${check.missing.join(', ')}`);
      }
      throw new Error(`INVALID_COOKIES: ${check.reason}${check.missing?.length ? ` | Missing: ${check.missing.join(', ')}` : ''}`);
    }

    console.log(`💾 Saving ${cookiesArray.length} cookies for "${accountName}"`);

    // ✅ المرحلة 1: التحديث في MongoDB
    const result = await Cookie.findOneAndUpdate(
      { accountName: accountName.trim() },
      {
        $set: {
          cookies: cookiesArray,
          status: 'ACTIVE',
          cooldownUntil: null,
          lastUsedAt: new Date()
        },
        $unset: {
          lastError: '',
          lastErrorTime: ''
        }
      },
      {
        new: true,
        upsert: true,
        runValidators: true,
        setDefaultsOnInsert: true
      }
    );

    console.log('────────────────────────────────────────────');
    console.log('📥 RESULT FROM findOneAndUpdate:');
    console.log('👤 Account:', result?.accountName);
    console.log('🍪 Result cookie count:', result?.cookies?.length || 0);
    console.log('🏷️ Result names:', result?.cookies?.map(c => c.name).join(', ') || 'NONE');

    // ✅ المرحلة 2: فحص مباشر من قاعدة البيانات (تجاوز أي Cache)
    console.log('────────────────────────────────────────────');
    console.log('🔎 FRESH DATABASE RECHECK (independent query):');

    const freshDoc = await Cookie.findOne({
      accountName: accountName.trim()
    }).select('accountName cookies pages status lastUsedAt');

    console.log('👤 Account:', freshDoc?.accountName);
    console.log('🍪 DB cookie count:', freshDoc?.cookies?.length || 0);
    console.log('🏷️ DB cookie names:', freshDoc?.cookies?.map(c => c.name).join(', ') || 'NONE');
    console.log('📄 DB pages count:', freshDoc?.pages?.length || 0);
    console.log('📊 DB status:', freshDoc?.status);
    console.log('🕐 DB lastUsedAt:', freshDoc?.lastUsedAt);

    // ✅ المرحلة 3: مقارنة النتائج
    console.log('────────────────────────────────────────────');
    console.log('📊 COMPARISON:');
    console.log('Expected count:', cookiesArray.length);
    console.log('Result count:', result?.cookies?.length || 0);
    console.log('Fresh DB count:', freshDoc?.cookies?.length || 0);

    if (freshDoc?.cookies?.length !== cookiesArray.length) {
      console.error('🚨 MISMATCH DETECTED!');
      console.error(`Expected: ${cookiesArray.length}, Fresh DB: ${freshDoc?.cookies?.length || 0}`);
      console.error('⚠️ This means something is modifying the cookies array after save!');
      throw new Error(`DB_MISMATCH: expected=${cookiesArray.length}, db=${freshDoc?.cookies?.length || 0}`);
    }

    if (result?.cookies?.length !== cookiesArray.length) {
      console.error('🚨 RESULT MISMATCH DETECTED!');
      console.error(`Expected: ${cookiesArray.length}, Result: ${result?.cookies?.length || 0}`);
      throw new Error(`RESULT_MISMATCH: expected=${cookiesArray.length}, result=${result?.cookies?.length || 0}`);
    }

    console.log('✅ ALL CHECKS PASSED! Counts match:');
    console.log(`   Expected: ${cookiesArray.length}`);
    console.log(`   Result: ${result?.cookies?.length || 0}`);
    console.log(`   Fresh DB: ${freshDoc?.cookies?.length || 0}`);
    console.log('════════════════════════════════════════════\n');

    return result;
  }

  // =========================================================
  // ✅ GET VALID ACTIVE ACCOUNT (مع تشخيص إضافي)
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
      console.log(`[COOKIE-MANAGER] 👤 "${account.accountName}" | COUNT=${account.cookies?.length || 0} | VALID=${check.valid}`);

      if (!check.valid) {
        console.warn(`[COOKIE-MANAGER] ⚠️ Skipping "${account.accountName}" | ${check.reason}`);
        continue;
      }

      console.log(`[COOKIE-MANAGER] ✅ Using "${account.accountName}"`);
      return { account, cookies: account.cookies, accountName: account.accountName };
    }

    console.error('[COOKIE-MANAGER] ❌ No valid accounts');
    return { account: null, reason: 'ALL_INVALID' };
  }

  // =========================================================
  // ✅ GET ALL ACTIVE IDENTITIES
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
  // ✅ GET NEXT AVAILABLE IDENTITY
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
  // ✅ UPDATE IDENTITY USAGE
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
  // ✅ SET COOLDOWN
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
  // ✅ GET ALL ACCOUNTS
  // =========================================================

  async getAllCookies() {
    try {
      return await Cookie.find({});
    } catch (error) {
      console.error(`❌ Error: ${error.message}`);
      return [];
    }
  }

  // =========================================================
  // ✅ DELETE ACCOUNT
  // =========================================================

  async deleteAccount(accountName) {
    return await Cookie.findOneAndDelete({ accountName });
  }

  // =========================================================
  // ✅ DELETE INACTIVE
  // =========================================================

  async deleteInactiveAccounts() {
    return await Cookie.deleteMany({ status: 'BLOCKED' });
  }

  // =========================================================
  // ✅ ADD PAGE
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
  // ✅ GET ACCOUNT PAGES
  // =========================================================

  async getAccountPages(accountName) {
    const account = await Cookie.findOne({ accountName });
    return account?.pages || [];
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
  // ✅ ERROR HANDLING
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
}

module.exports = new CookieManagerService();
