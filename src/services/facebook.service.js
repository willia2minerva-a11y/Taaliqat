// src/services/facebook.service.js
const puppeteer = require('puppeteer');

class FacebookService {
  /**
   * إنشاء جلسة متصفح آمنة وتغذيتها بالكوكيز بأسلوب آمن ومعالج بروتوكولياً
   */
  static async createSession(rawCookies) {
    // 1. إطلاق المتصفح بإعدادات آمنة لبيئة Render/Linux
    const browser = await puppeteer.launch({
      headless: true,
      args: [
        '--no-sandbox',
        '--disable-setuid-sandbox',
        '--disable-dev-shm-usage',
        '--disable-accelerated-2d-canvas',
        '--no-first-run',
        '--no-zygote',
        '--disable-gpu'
      ]
    });

    const page = await browser.newPage();

    try {
      // 2. تفريغ كوكيز الجلسة عبر CDP بدون الوقوع في خطأ Network.deleteCookies
      const client = await page.target().createCDPSession();
      await client.send('Network.clearBrowserCookies');

      // 3. توحيد وتصحيح بنية الكوكيز لضمان مطابقة متطلبات Puppeteer
      const formattedCookies = rawCookies.map(cookie => {
        // إستبعاد الخصائص غير المطبقة أو المسببة للأخطاء
        const { sameSite, ...validProperties } = cookie;

        return {
          ...validProperties,
          // إسناد Fallback للنطاق والرابط لضمان قبول البروتوكول
          domain: cookie.domain || '.facebook.com',
          url: cookie.url || 'https://www.facebook.com'
        };
      });

      // 4. إسناد الكوكيز المعالجة للصفحة
      await page.setCookie(...formattedCookies);

      return { browser, page };
    } catch (error) {
      // ضمان إغلاق المتصفح في حال وجود أي استثناء لمنع تسرب الذاكرة (Memory Leak)
      await browser.close();
      throw new Error(`فشل إعداد جلسة المتصفح: ${error.message}`);
    }
  }

  /**
   * تنفيذ عملية التعليق على منشور محدد
   */
  static async postComment(cookiesData, postUrl, commentText) {
    let session = null;
    try {
      session = await FacebookService.createSession(cookiesData);
      const { page, browser } = session;

      // التوجه للمنشور وتنفيذ الإجراء
      await page.goto(postUrl, { waitUntil: 'networkidle2', timeout: 60000 });
      
      // === أضف منطق الضغط على التعليق والنشر الخاص بك هنا ===

      await browser.close();
      return true;
    } catch (error) {
      if (session?.browser) await session.browser.close();
      console.error('❌ Error in postComment:', error.message);
      throw error;
    }
  }
}

module.exports = FacebookService;
