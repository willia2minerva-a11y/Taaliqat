const express = require('express');
const router = express.Router();
const controller = require('../controllers/webhook.controller');

router.get('/', (req, res) =>
  controller.verifyWebhook(req, res)
);

router.post('/', (req, res) =>
  controller.handleWebhookEvent(req, res)
);

router.get('/test', (req, res) => {
  res.status(200).json({
    ok: true,
    webhook: '/webhook',
    time: new Date().toISOString()
  });
});

module.exports = router;
