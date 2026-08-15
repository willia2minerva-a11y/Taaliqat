const axios = require('axios');
const config = require('../config');

class MessengerService {

  async sendTextMessage(recipientId, text) {
    const token =
      config.pageAccessToken ||
      process.env.PAGE_ACCESS_TOKEN;

    if (!token) {
      throw new Error('PAGE_ACCESS_TOKEN is missing');
    }

    if (!recipientId) {
      throw new Error('Recipient ID is missing');
    }

    const message = String(text || '').trim();

    if (!message) {
      throw new Error('Message text is empty');
    }

    const version =
      process.env.META_GRAPH_VERSION || 'v19.0';

    const url =
      `https://graph.facebook.com/${version}/me/messages`;

    console.log(
      `[MESSENGER] 📤 Sending to ${recipientId}: ${message.slice(0, 80)}`
    );

    try {
      const response = await axios.post(
        url,
        {
          recipient: { id: recipientId },
          message: { text: message },
          messaging_type: 'RESPONSE'
        },
        {
          params: {
            access_token: token
          },
          timeout: 15000
        }
      );

      console.log(
        `[MESSENGER] ✅ Sent | recipient=${recipientId} | message_id=${response.data?.message_id || 'UNKNOWN'}`
      );

      return response.data;

    } catch (error) {
      const apiError =
        error.response?.data?.error;

      console.error(
        '[MESSENGER] ❌ SEND FAILED'
      );

      console.error(
        `[MESSENGER] Status: ${error.response?.status || 'NO_RESPONSE'}`
      );

      console.error(
        `[MESSENGER] Type: ${apiError?.type || 'UNKNOWN'}`
      );

      console.error(
        `[MESSENGER] Code: ${apiError?.code || 'UNKNOWN'}`
      );

      console.error(
        `[MESSENGER] Message: ${apiError?.message || error.message}`
      );

      throw new Error(
        `MESSENGER_SEND_ERROR: ${apiError?.message || error.message}`
      );
    }
  }
}

module.exports = new MessengerService();
