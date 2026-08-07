const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY } = require('../config');

class AiService {
  static async generateComment(postText) {
    if (!GEMINI_API_KEY) {
      console.warn('⚠️ GEMINI_API_KEY مفقود، استخدام تعليق افتراضي.');
      return "منشور جميل ومميز جداً، تسلم على المشاركة!";
    }

    try {
      const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });

      const prompt = `أنت مستخدم تفاعلي حقيقي في مجموعة فيسبوك. اقرأ المنشور التالي واكتب تعليقاً مناسباً ومنطقياً وعفوياً باللغة العربية.
      الشروط الصارمة:
      1. يجب أن يزيد طول التعليق عن 5 كلمات ولا يتجاوز 20 كلمة.
      2. ممنوع استخدام لغة أكاديمية جافة أو روبوتية (تجنب كلمات مثل: يسعدني، موضوع قيّم، الخ).
      3. لا تكرر نص المنشور ولا تستخدم الهاشتاجات.
      
      نص المنشور: "${postText}"`;

      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('[AI Service Error]:', error.message);
      return "منشور جميل ومميز جداً، تسلم على المشاركة!";
    }
  }
}

module.exports = AiService;
