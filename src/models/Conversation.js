const mongoose = require('mongoose');

const conversationSchema = new mongoose.Schema({
  isGroup: { type: Boolean, default: false },
  name: { type: String },
  memberIds: [{ type: String }],
  adminId: { type: String },
  lastMessage: { type: String },
  lastMessageAt: { type: Date },
  unreadCounts: { type: Map, of: Number, default: {} },
  deletedHistoryAt: { type: Map, of: Date, default: {} },
  avatarUrl: { type: String },
  pinnedMessage: { type: String },
  mutedUserIds: [{ type: String }]
}, { 
  timestamps: true,
  toJSON: { virtuals: true, flattenMaps: true },
  toObject: { virtuals: true, flattenMaps: true }
});

module.exports = mongoose.model('Conversation', conversationSchema);
