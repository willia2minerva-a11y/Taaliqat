// src/services/cookieManager.service.js
const Cookie = require('../models/Cookie');

class CookieManagerService {
  // ✅ تفعيل كوكيز
  async enableCookie(cookieData) {
    try {
      console.log('🍪 Enabling cookie...');
      
      let cookies = cookieData;
      if (typeof cookieData === 'string') {
        cookies = cookieData.split('; ').map(cookie => {
          const [name, value] = cookie.split('=');
          return { name: name.trim(), value: value || '', domain: '.facebook.com', path: '/' };
        });
      }

      const cookieDoc = await Cookie.findOneAndUpdate(
        { accountName: 'main_account' },
        { cookies, status: 'ACTIVE', lastUsedAt: new Date() },
        { upsert: true, new: true }
      );

      console.log(`✅ Cookie enabled: ${cookieDoc.accountName}`);
      return cookieDoc;
    } catch (error) {
      console.error(`❌ Error enabling cookie: ${error.message}`);
      throw error;
    }
  }

  // ✅ الحصول على كوكيز نشطة
  async getActiveCookies() {
    try {
      const cookieDoc = await Cookie.findOne({ status: 'ACTIVE' }).sort({ lastUsedAt: 1 });
      if (!cookieDoc) {
        console.log('⚠️ No active cookies found');
        return null;
      }
      console.log(`✅ Active cookies: ${cookieDoc.accountName}`);
      return cookieDoc.cookies;
    } catch (error) {
      console.error(`❌ Error fetching cookies: ${error.message}`);
      return null;
    }
  }

  // ✅ الحصول على جميع الكوكيز (للمراقبة)
  async getAllCookies() {
    try {
      const cookies = await Cookie.find({});
      console.log(`📊 Found ${cookies.length} cookie entries`);
      return cookies;
    } catch (error) {
      console.error(`❌ Error fetching cookies: ${error.message}`);
      return [];
    }
  }

  // ✅ إضافة كوكيز جديدة
  async addCookies(accountName, cookies) {
    try {
      console.log(`🍪 Adding new cookies for: ${accountName}`);
      
      const cookieDoc = new Cookie({
        accountName: accountName,
        cookies: cookies,
        status: 'ACTIVE',
        lastUsedAt: new Date()
      });

      await cookieDoc.save();
      console.log(`✅ Cookies added: ${accountName}`);
      return cookieDoc;
    } catch (error) {
      console.error(`❌ Error adding cookies: ${error.message}`);
      throw error;
    }
  }

  // ✅ حظر كوكيز
  async blockCookie(cookieId, reason = 'Blocked') {
    try {
      const updated = await Cookie.findByIdAndUpdate(
        cookieId,
        { status: 'BLOCKED', cooldownUntil: new Date(Date.now() + 30 * 60 * 1000) },
        { new: true }
      );
      return updated;
    } catch (error) {
      console.error(`❌ Error blocking cookie: ${error.message}`);
      throw error;
    }
  }

  // ✅ إعادة تفعيل كوكيز
  async unblockCookie(cookieId) {
    try {
      const updated = await Cookie.findByIdAndUpdate(
        cookieId,
        { status: 'ACTIVE', cooldownUntil: null },
        { new: true }
      );
      return updated;
    } catch (error) {
      console.error(`❌ Error unblocking cookie: ${error.message}`);
      throw error;
    }
  }

  // ✅ التحقق من صحة الكوكيز
  async validateCookies(cookies) {
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) return false;
    const required = ['datr', 'fr', 'c_user', 'xs'];
    return required.every(name => cookies.some(c => c.name === name && c.value));
  }

  // ✅ تحديث وقت استخدام الكوكيز
  async updateCookieUsage(cookieId) {
    try {
      await Cookie.findByIdAndUpdate(cookieId, { lastUsedAt: new Date() });
      console.log(`🔄 Cookie ${cookieId} usage updated`);
    } catch (error) {
      console.error(`❌ Error updating cookie usage: ${error.message}`);
    }
  }
}

module.exports = new CookieManagerService();
