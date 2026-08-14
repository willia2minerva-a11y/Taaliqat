// src/routes/webhook.routes.js
const express = require('express');
const router = express.Router();
const webhookController = require('../controllers/webhook.controller');

// ✅ التحقق من Webhook (GET)
router.get('/', (req, res) => webhookController.verifyWebhook(req, res));

// ✅ استقبال الأحداث (POST)
router.post('/', (req, res) => webhookController.handleWebhookEvent(req, res));

// ✅ مسار إضافي للاختبار
router.get('/test', (req, res) => {
  res.status(200).json({
    status: 'success',
    message: 'Webhook endpoint is working!',
    verifyToken: process.env.VERIFY_TOKEN || 'not set'
  });
});

module.exports = router;
