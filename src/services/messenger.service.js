// src/services/messenger.service.js
const axios = require('axios');
const config = require('../config');

class MessengerService {
  async sendTextMessage(recipientId, text) {
    const accessToken = config.pageAccessToken || process.env.PAGE_ACCESS_TOKEN;
    
    if (!accessToken) {
      console.warn('⚠️ PAGE_ACCESS_TOKEN is not configured.');
      return;
    }

    try {
      console.log(`📤 Sending message to ${recipientId}: ${text.substring(0, 50)}...`);
      
      const response = await axios.post(
        `https://graph.facebook.com/v19.0/me/messages?access_token=${accessToken}`,
        {
          recipient: { id: recipientId },
          message: { text: text },
          messaging_type: 'RESPONSE'
        }
      );

      console.log(`✅ Message sent successfully to ${recipientId}`);
      return response.data;
    } catch (error) {
      console.error(`❌ Messenger Send Error: ${error.response?.data?.error?.message || error.message}`);
      throw new Error(`Failed to send message: ${error.response?.data?.error?.message || error.message}`);
    }
  }
}

module.exports = new MessengerService();
