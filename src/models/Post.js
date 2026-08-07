const mongoose = require('mongoose');

const postSchema = new mongoose.Schema({
  postId: { type: String, required: true, unique: true },
  contentSnippet: { type: String },
  processedAt: { type: Date, default: Date.now }
});

module.exports = mongoose.model('Post', postSchema);
