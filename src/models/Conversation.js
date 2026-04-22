const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  isGroup: { type: Boolean, default: false },
  name: { type: String },
  memberIds: [{ type: String }],
  adminId: { type: String },
  lastMessage: { type: String },
  lastMessageAt: { type: Date },
  lastMessageSenderId: { type: String },
  sentByUserIds: [{ type: String }],
  unreadCounts: { type: Map, of: Number, default: {} },
  deletedHistoryAt: { type: Map, of: Date, default: {} },
  avatarUrl: { type: String },
  pinnedMessages: [{
    messageId: { type: String },
    content: { type: String },
    type: { type: String, default: 'TEXT' },
    senderName: { type: String },
    createdAt: { type: Date, default: Date.now }
  }],
  mutedUserIds: [{ type: String }],
  pinnedBy: [{ type: String }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true, flattenMaps: true },
  toObject: { virtuals: true, flattenMaps: true }
});
// Indexes for optimized queries
conversationSchema.index({ memberIds: 1, lastMessageAt: -1 });

module.exports = mongoose.model('Conversation', conversationSchema);
