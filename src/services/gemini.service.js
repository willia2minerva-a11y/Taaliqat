// src/services/gemini.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor() {
    this.fallbackComments = [
      "موضوع ممتاز ومفيد جداً، أحسنت النشر! 👏",
      "طرح رائع واستفدت منه كثيراً، شكراً لك 👍",
      "بالتوفيق، منشور في القمة! ✨",
      "معلومات قيمة وإضافة ممتازة للمجموعة 🙌"
    ];
  }

  /**
   * تقليم النص وتجهيز الرد الذكي مع الحماية من استنزاف API
   * @param {string} postText - نص المنشور الأصلي
   * @param {string} apiKey - مفتاح Gemini API
   */
  async generateSmartComment(postText, apiKey) {
    if (!apiKey) {
      return this._getRandomFallback();
    }

    try {
      // تقليم النص لأول 150 حرفاً لتوفير التكلفة والرموز (Tokens)
      const truncatedText = postText.length > 150 ? postText.substring(0, 150) + '...' : postText;

      const genAI = new GoogleGenerativeAI(apiKey);
      const model = genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });

      const prompt = `أنت معلق متفاعل ومحترف. اكتب تعليقاً مشجعاً وذكياً باللغة العربية على المنشور التالي في حدود 10 إلى 20 كلمة فقط دون استخدام أقواس أو مقدمات.\nالمنشور: "${truncatedText}"`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      const reply = response.text() ? response.text().trim() : null;

      return reply || this._getRandomFallback();

    } catch (error) {
      console.error(`[Gemini API Error]: ${error.message}`);
      // الانتقال الخفيف والآمن للرد البديل عند حدث أي استثناء
      return this._getRandomFallback();
    }
  }

  _getRandomFallback() {
    const idx = Math.floor(Math.random() * this.fallbackComments.length);
    return this.fallbackComments[idx];
  }
}

module.exports = new GeminiService();
