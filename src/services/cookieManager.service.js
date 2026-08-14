// src/services/cookieManager.service.js
const Cookie = require('../models/Cookie');

class CookieManagerService {
  // ✅ تفعيل الكوكيز
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

  // ✅ التحقق من صلاحية الكوكيز
  async validateCookies(cookies) {
    if (!cookies || !Array.isArray(cookies) || cookies.length === 0) return false;
    const required = ['datr', 'fr', 'c_user', 'xs'];
    return required.every(name => cookies.some(c => c.name === name && c.value));
  }
}

module.exports = new CookieManagerService();
