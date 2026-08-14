// src/routes/webhook.routes.js
const express = require('express');
const router = express.Router();
const WebhookController = require('../controllers/webhook.controller');

// فحص أمان وقائي للتأكد من استيراد الدوال بالشكل الصحيح وعدم تمرير undefined
if (!WebhookController || typeof WebhookController.verifyWebhook !== 'function' || typeof WebhookController.handleMessage !== 'function') {
  console.error('❌ CRITICAL ERROR: WebhookController static methods are not properly exported!');
}

/**
 * GET /webhook - مسار التحقق من الصحة مع فيسبوك (Webhook Verification)
 */
router.get('/webhook', WebhookController.verifyWebhook);

/**
 * POST /webhook - مسار استقبال الأحداث والرسائل من ميسنجر
 */
router.post('/webhook', WebhookController.handleMessage);

module.exports = router;

