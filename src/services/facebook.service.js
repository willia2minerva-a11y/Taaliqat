const puppeteer = require('puppeteer');
const fs = require('fs');
const path = require('path');
const { FB_GROUP_URL, TIMING } = require('../config');

class FacebookService {
  constructor() {
    this.browser = null;
    this.page = null;
  }

  async randomDelay(min, max) {
    const delay = Math.floor(Math.random() * (max - min + 1)) + min;
    return new Promise(resolve => setTimeout(resolve, delay));
  }

  async init() {
    this.browser = await puppeteer.launch({
      headless: true, // يجب أن يكون true ليعمل على Render
      args: ['--no-sandbox', '--disable-setuid-sandbox']
    });
    this.page = await this.browser.newPage();
    
    // حقن الكوكيز لتخطي تسجيل الدخول
    const cookiesPath = path.join(__dirname, '../../cookies.json');
    if (fs.existsSync(cookiesPath)) {
      const cookiesString = fs.readFileSync(cookiesPath);
      const cookies = JSON.parse(cookiesString);
      await this.page.setCookie(...cookies);
      console.log('✅ تم حقن الكوكيز بنجاح.');
    } else {
      console.warn('⚠️ تحذير: ملف cookies.json غير موجود.');
    }
  }

  async goToGroup() {
    await this.page.goto(FB_GROUP_URL, { waitUntil: 'networkidle2' });
  }

  async processPost(postElement, smartComment, fixedComment) {
    try {
      // TODO: يجب تحديث هذه المحددات (Selectors) بناءً على تحديثات واجهة فيسبوك الحالية
      const commentBoxSelector = 'div[aria-label="Write a comment"]'; 
      
      // النقر على مربع التعليق
      await postElement.click(commentBoxSelector);
      await this.randomDelay(1000, 2000);
      
      // التعليق الأول
      await this.page.keyboard.type(smartComment, { delay: 50 });
      await this.page.keyboard.press('Enter');
      
      await this.randomDelay(TIMING.COMMENT_DELAY_MIN, TIMING.COMMENT_DELAY_MAX);
      
      // التعليق الثاني
      await postElement.click(commentBoxSelector);
      await this.page.keyboard.type(fixedComment, { delay: 50 });
      await this.page.keyboard.press('Enter');
      
      return true;
    } catch (error) {
      console.error('[FB] خطأ أثناء التعليق:', error.message);
      return false;
    }
  }

  async close() {
    if (this.browser) await this.browser.close();
  }
}
module.exports = FacebookService;
