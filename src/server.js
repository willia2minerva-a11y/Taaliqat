const express = require('express');
const DbService = require('./services/db.service');
const WebhookController = require('./controllers/webhook.controller');
const { startWorkerLoop } = require('./worker');
const { PORT } = require('./config');

const app = express();
app.use(express.json());

// مسارات فيسبوك Webhook
app.get('/webhook', WebhookController.verifyWebhook);
app.post('/webhook', WebhookController.handleMessage);

// Health check endpoint لخدمة Render
app.get('/', (req, res) => {
  res.status(200).send('DevMate Facebook Automation Server is Live.');
});

async function main() {
  await DbService.connect();

  app.listen(PORT, () => {
    console.log(`🚀 Express Server running on port ${PORT}`);
  });

  // إطلاق محرك الأتمتة في الخلفية
  startWorkerLoop();
}

main();
