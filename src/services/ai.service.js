const { GoogleGenerativeAI } = require('@google/generative-ai');
const { GEMINI_API_KEY } = require('../config');

const genAI = new GoogleGenerativeAI(GEMINI_API_KEY);

class AiService {
  static async generateComment(postText) {
    try {
      const model = genAI.getGenerativeModel({ model: "gemini-1.5-flash" });
      const prompt = `أنت مستخدم حقيقي في مجموعة فيسبوك. اقرأ المنشور التالي واكتب تعليقاً بشرياً ومنطقياً لا يتجاوز 15 كلمة ولا يقل عن 5 كلمات. المنشور: "${postText}"`;
      
      const result = await model.generateContent(prompt);
      const response = await result.response;
      return response.text().trim();
    } catch (error) {
      console.error('[AI Service Error]:', error.message);
      return "منشور مميز، شكراً للمشاركة معنا."; // Fallback
    }
  }
}
module.exports = AiService;
