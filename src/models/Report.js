const mongoose = require('mongoose');

const reportSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  title: { type: String, required: true },
  description: { type: String, required: true },
  status: { type: String, enum: ['PENDING', 'RESOLVED'], default: 'PENDING' },
  type: { type: String, enum: ['BUG', 'SUGGESTION', 'SECURITY', 'OTHER'], default: 'BUG' },
  adminReply: { type: String },
  resolvedAt: { type: Date }
}, { timestamps: true });

module.exports = mongoose.model('Report', reportSchema);
