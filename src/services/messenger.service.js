const axios = require('axios');
const { FB_PAGE_ACCESS_TOKEN } = require('../config');

class MessengerService {
  /**
   * إرسال رسالة نصية إلى حسابك على المسنجر
   */
  static async sendMessage(recipientId, text) {
    if (!FB_PAGE_ACCESS_TOKEN) {
      console.error('❌ FB_PAGE_ACCESS_TOKEN مفقود، تعذر إرسال الإشعار عبر المسنجر.');
      return;
    }

    try {
      await axios.post(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${FB_PAGE_ACCESS_TOKEN}`,
        {
          recipient: { id: recipientId },
          message: { text }
        }
      );
    } catch (error) {
      console.error('❌ فشل إرسال رسالة المسنجر:', error.response?.data || error.message);
    }
  }
}

module.exports = MessengerService;
