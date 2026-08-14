// src/services/cookieManager.service.js
const Cookie = require('../models/Cookie');

class CookieManagerService {
  // ✅ تفعيل الكوكيز (الوظيفة التي كانت مكسورة)
  async enableCookie(cookieData) {
    try {
      console.log('🍪 Enabling cookie...');
      
      // إذا كان cookieData هو نص (string)، قم بمعالجته
      let cookies = cookieData;
      if (typeof cookieData === 'string') {
        // تحويل النص إلى مصفوفة كوكيز
        cookies = cookieData.split('; ').map(cookie => {
          const [name, value] = cookie.split('=');
          return { 
            name: name.trim(), 
            value: value || '',
            domain: '.facebook.com',
            path: '/'
          };
        });
      }

      // تخزين الكوكيز في قاعدة البيانات
      const cookieDoc = await Cookie.findOneAndUpdate(
        { accountName: 'main_account' },
        { 
          cookies: cookies,
          status: 'ACTIVE',
          lastUsedAt: new Date()
        },
        { upsert: true, new: true }
      );

      console.log(`✅ Cookie enabled successfully for account: ${cookieDoc.accountName}`);
      return cookieDoc;
    } catch (error) {
      console.error(`❌ Error enabling cookie: ${error.message}`);
      throw error;
    }
  }

  // ✅ الحصول على كوكيز نشطة
  async getActiveCookies() {
    try {
      console.log('🔍 Fetching active cookies...');
      
      const cookieDoc = await Cookie.findOne({ 
        status: 'ACTIVE' 
      }).sort({ lastUsedAt: 1 });

      if (!cookieDoc) {
        console.log('⚠️ No active cookies found');
        return null;
      }

      console.log(`✅ Active cookies found for: ${cookieDoc.accountName}`);
      return cookieDoc.cookies;
    } catch (error) {
      console.error(`❌ Error fetching active cookies: ${error.message}`);
      return null;
    }
  }

  // ✅ حظر كوكيز (بسبب خطأ أو حظر من فيسبوك)
  async blockCookie(cookieId, reason = 'Blocked by system') {
    try {
      console.log(`🚫 Blocking cookie: ${cookieId} - Reason: ${reason}`);
      
      const updated = await Cookie.findByIdAndUpdate(
        cookieId,
        { 
          status: 'BLOCKED',
          cooldownUntil: new Date(Date.now() + 30 * 60 * 1000) // 30 دقيقة
        },
        { new: true }
      );

      if (updated) {
        console.log(`✅ Cookie ${cookieId} blocked successfully`);
        return updated;
      } else {
        console.log(`⚠️ Cookie ${cookieId} not found`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error blocking cookie: ${error.message}`);
      throw error;
    }
  }

  // ✅ إعادة تفعيل كوكيز (بعد فترة التهدئة)
  async unblockCookie(cookieId) {
    try {
      console.log(`🔄 Unblocking cookie: ${cookieId}`);
      
      const updated = await Cookie.findByIdAndUpdate(
        cookieId,
        { 
          status: 'ACTIVE',
          cooldownUntil: null
        },
        { new: true }
      );

      if (updated) {
        console.log(`✅ Cookie ${cookieId} unblocked successfully`);
        return updated;
      } else {
        console.log(`⚠️ Cookie ${cookieId} not found`);
        return null;
      }
    } catch (error) {
      console.error(`❌ Error unblocking cookie: ${error.message}`);
      throw error;
    }
  }

  // ✅ التحقق من صلاحية الكوكيز
  async validateCookies(cookies) {
    try {
      if (!cookies || !Array.isArray(cookies) || cookies.length === 0) {
        return false;
      }

      // التحقق من وجود الكوكيز الأساسية
      const requiredCookies = ['datr', 'fr', 'c_user', 'xs'];
      const hasRequired = requiredCookies.every(name => 
        cookies.some(cookie => cookie.name === name && cookie.value)
      );

      if (!hasRequired) {
        console.log('⚠️ Missing required Facebook cookies');
        return false;
      }

      console.log('✅ Cookies validated successfully');
      return true;
    } catch (error) {
      console.error(`❌ Error validating cookies: ${error.message}`);
      return false;
    }
  }

  // ✅ إضافة كوكيز جديدة (من خلال المسؤول)
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
      console.log(`✅ Cookies added successfully for: ${accountName}`);
      return cookieDoc;
    } catch (error) {
      console.error(`❌ Error adding cookies: ${error.message}`);
      throw error;
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

  // ✅ تحديث حالة الكوكيز (عند الاستخدام)
  async updateCookieUsage(cookieId) {
    try {
      await Cookie.findByIdAndUpdate(
        cookieId,
        { lastUsedAt: new Date() }
      );
      console.log(`🔄 Cookie ${cookieId} usage updated`);
    } catch (error) {
      console.error(`❌ Error updating cookie usage: ${error.message}`);
    }
  }
}

module.exports = new CookieManagerService();
