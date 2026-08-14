// src/services/gemini.service.js
const { GoogleGenAI } = require('@google/genai');

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
   */
  async generateSmartComment(postText, apiKey) {
    if (!apiKey) {
      return this._getRandomFallback();
    }

    try {
      // تقليم النص لأول 150 حرفاً لتوفير 80% من التكلفة والرموز
      const truncatedText = postText.length > 150 ? postText.substring(0, 150) + '...' : postText;

      const ai = new GoogleGenAI({ apiKey });
      const prompt = `أنت معلق متفاعل ومحترف. اكتب تعليقاً مشجعاً وذكياً باللغة العربية على المنشور التالي في حدود 10 إلى 20 كلمة فقط دون استخدام أقواس أو مقدمات.\nالمنشور: "${truncatedText}"`;

      const response = await ai.models.generateContent({
        model: 'gemini-2.5-flash',
        contents: prompt
      });

      const reply = response.text ? response.text.trim() : null;
      return reply || this._getRandomFallback();

    } catch (error) {
      console.error(`[Gemini API Error]: ${error.message}`);
      // إرجاع الخطة B عند حدوث أي خطأ في المفاتيح أو الحصة
      return this._getRandomFallback();
    }
  }

  _getRandomFallback() {
    const idx = Math.floor(Math.random() * this.fallbackComments.length);
    return this.fallbackComments[idx];
  }
}

module.exports = new GeminiService();
