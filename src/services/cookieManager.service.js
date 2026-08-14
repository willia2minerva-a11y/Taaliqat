// src/services/cookieManager.service.js
const Cookie = require('../models/Cookie');

class CookieManagerService {
  // ✅ الحصول على جميع الكوكيز مع أسماء الحسابات
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
      console.error(`❌ Error fetching active cookies: ${error.message}`);
      return null;
    }
  }

  // ✅ إضافة كوكيز جديدة
  async addCookies(accountName, cookies) {
    try {
      console.log(`🍪 Adding new cookies for: ${accountName}`);
      
      // التحقق من وجود الحساب مسبقاً
      const existing = await Cookie.findOne({ accountName });
      if (existing) {
        // تحديث الكوكيز الموجودة
        existing.cookies = cookies;
        existing.status = 'ACTIVE';
        existing.lastUsedAt = new Date();
        await existing.save();
        console.log(`✅ Cookies updated for: ${accountName}`);
        return existing;
      }

      // إنشاء حساب جديد
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

  // ✅ حذف حساب
  async deleteAccount(accountName) {
    try {
      const result = await Cookie.findOneAndDelete({ accountName });
      return result;
    } catch (error) {
      console.error(`❌ Error deleting account: ${error.message}`);
      throw error;
    }
  }

  // ✅ حذف جميع الحسابات غير النشطة
  async deleteInactiveAccounts() {
    try {
      const result = await Cookie.deleteMany({ status: 'BLOCKED' });
      return result;
    } catch (error) {
      console.error(`❌ Error deleting inactive accounts: ${error.message}`);
      throw error;
    }
  }
}

module.exports = new CookieManagerService();
