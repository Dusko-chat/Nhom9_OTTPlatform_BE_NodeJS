const mongoose = require('mongoose');

const aiKnowledgeSchema = new mongoose.Schema({
  fileName: {
    type: String,
    required: true
  },
  textChunk: {
    type: String,
    required: true
  },
  embeddingVector: {
    type: [Number],
    required: true
  },
  createdAt: {
    type: Date,
    default: Date.now
  }
});

// Indexing for faster retrieval
aiKnowledgeSchema.index({ createdAt: -1 });

module.exports = mongoose.model('AiKnowledge', aiKnowledgeSchema, 'ai_knowledge');
