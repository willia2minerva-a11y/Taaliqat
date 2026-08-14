// src/services/gemini.service.js
const { GoogleGenerativeAI } = require('@google/generative-ai');

class GeminiService {
  constructor() {
    // جلب المفاتيح وتفكيكها من ملف البيئة
    const rawKeys = process.env.GEMINI_API_KEYS || process.env.GEMINI_API_KEY || '';
    this.apiKeys = rawKeys.split(',').map(k => k.trim()).filter(Boolean);
    this.currentKeyIndex = 0;

    // قائمة تعليقات الخطة B (عامة ومناسبة لأي منشور)
    this.fallbackComments = [
      'تصميم جميل ومنسق ابدعت في النصوص و الالوان',
      'تقرير مفصل و تصميم مرتب مبدع واصل',
      'مجهود رائع وعمل متقن جداً بالتوفيق',
      'محتوى ممتازامتاص وفكرة جميلة جداً أبدعت',
      'طرح ممتاز وزوايا إبداعية راقية أحييك'
    ];
    this.fallbackIndex = 0;
  }

  /**
   * الحصول على نموذج جاهز للاستخدام مع المفتاح الحالي
   */
  _getModel() {
    if (this.apiKeys.length === 0) return null;
    const apiKey = this.apiKeys[this.currentKeyIndex];
    const genAI = new GoogleGenerativeAI(apiKey);
    return genAI.getGenerativeModel({ model: 'gemini-1.5-flash' });
  }

  /**
   * التدوير للمفتاح التالي في حال الفشل
   */
  _rotateKey() {
    if (this.apiKeys.length <= 1) return;
    this.currentKeyIndex = (this.currentKeyIndex + 1) % this.apiKeys.length;
    console.log(`🔄 تم التبديل إلى مفتاح Gemini رقم: ${this.currentKeyIndex + 1}`);
  }

  /**
   * الحصول على تعليق من الخطة B وتدويره
   */
  getFallbackComment() {
    const comment = this.fallbackComments[this.fallbackIndex];
    this.fallbackIndex = (this.fallbackIndex + 1) % this.fallbackComments.length;
    return comment;
  }

  /**
   * توليد تعليق ذكي بناءً على محتوى المنشور
   * @param {string} postText - نص المنشور
   */
  async generateComment(postText) {
    if (!postText || postText.trim().length < 5) {
      return {
        comment: this.getFallbackComment(),
        isAi: false,
        reason: 'نص المنشور قصير جداً أو غير واضح'
      };
    }

    const prompt = `
أنت مشجع متفاعل وخبير في منشورات مجتمعات الأنمي والتصميم.
قم بكتابة تعليق قصير ومباشر ورائع رداً على المنشور التالي.

الشروط الصارمة:
1. أن يكون التعليق حوارياً ومجيباً أو متسائلاً عن محتوى المنشور.
2. ألّا يقل التعليق عن 5 كلمات.
3. تجنب الردود التسليكية الجاهزة أو الجمل التي تبدو كأنها من ذكاء اصطناعي.
4. استخدم اللغة العربية بأسلوب طبيعي ومتحمس بدون مقدمات أو علامات تنصيص.

نص المنشور:
"${postText}"
`;

    let attempts = 0;
    const maxAttempts = Math.max(1, this.apiKeys.length);

    while (attempts < maxAttempts) {
      try {
        const model = this._getModel();
        if (!model) throw new Error('لا توجد مفاتيح Gemini API مجهزة');

        const result = await model.generateContent(prompt);
        const responseText = result.response.text().trim();

        // التحقق من الشروط (أكثر من 5 كلمات)
        const wordCount = responseText.split(/\s+/).length;
        if (wordCount >= 5) {
          return {
            comment: responseText,
            isAi: true
          };
        }

        throw new Error('التعليق المولد أصل من 5 كلمات');

      } catch (error) {
        console.warn(`⚠️ فشل التوليد بالمفتاح الحالي (${error.message}). جاري المحاولة بمفتاح آخر...`);
        this._rotateKey();
        attempts++;
      }
    }

    // الخطة B عند فشل جميع المفاتيح أو الشروط
    return {
      comment: this.getFallbackComment(),
      isAi: false,
      reason: 'فشل التوليد عبر الذكاء الاصطناعي/جميع المفاتيح'
    };
  }
}

module.exports = new GeminiService();

