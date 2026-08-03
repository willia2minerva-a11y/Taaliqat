const DbService = require('./services/db.service');
const FacebookService = require('./services/facebook.service');
const AiService = require('./services/ai.service');
const Post = require('./models/Post');
const { FIXED_COMMENT, TIMING } = require('./config');

async function runJob() {
  console.log('🚀 بدء مهمة البوت...');
  const fbService = new FacebookService();
  
  try {
    await DbService.connect();
    await fbService.init();
    await fbService.goToGroup();

    // TODO: استبدل المحدد بـ CSS Class الصحيح للمنشورات في المجموعة
    const postSelector = 'div[role="article"]'; 
    await fbService.page.waitForSelector(postSelector, { timeout: 10000 });
    const posts = await fbService.page.$$(postSelector);

    // نقتصر على أول 3 منشورات في كل دورة لتجنب الحظر
    for (const post of posts.slice(0, 3)) {
      // TODO: استخراج المعرف الفريد للمنشور
      const postId = await fbService.page.evaluate(el => el.getAttribute('aria-describedby') || Date.now().toString(), post);
      
      const isProcessed = await Post.findOne({ postId });
      if (isProcessed) continue;

      // TODO: استخراج نص المنشور
      const postText = await fbService.page.evaluate(el => el.innerText, post);
      if (!postText) continue;

      const smartComment = await AiService.generateComment(postText);
      const success = await fbService.processPost(post, smartComment, FIXED_COMMENT);

      if (success) {
        await Post.create({ postId });
        console.log(`✅ تمت معالجة المنشور: ${postId}`);
      }

      await fbService.randomDelay(TIMING.POST_DELAY_MIN, TIMING.POST_DELAY_MAX);
    }
  } catch (error) {
    console.error('❌ خطأ في النظام الأساسي:', error.message);
  } finally {
    await fbService.close();
    await DbService.disconnect();
    console.log('🏁 انتهت الدورة.');
  }
}

runJob();
