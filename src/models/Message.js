const mongoose = require('mongoose');

const messageSchema = new mongoose.Schema({
  conversationId: { type: String, required: true },
  senderId: { type: String, required: true },
  senderName: { type: String },
  senderAvatar: { type: String },
  content: { type: String },
  type: { type: String, default: 'TEXT' }, // TEXT, IMAGE, VIDEO, FILE, SYSTEM, RECALL, POLL
  mediaUrl: { type: String },
  reactions: { type: Map, of: String, default: {} }, // userId -> emoji
  status: { type: String, default: 'SENT' }, // SENT, DELIVERED, SEEN, RECALLED
  replyToId: { type: String },
  replyToContent: { type: String },
  contactData: {
    userId: { type: String },
    fullName: { type: String },
    avatarUrl: { type: String },
    email: { type: String }
  },
  pollData: {
    question: { type: String },
    options: [{
      text: { type: String },
      voters: [{ type: String }] // Array of user IDs
    }],
    isMultiple: { type: Boolean, default: false },
    closed: { type: Boolean, default: false }
  }
}, { 
  timestamps: true,
  toJSON: { virtuals: true, flattenMaps: true },
  toObject: { virtuals: true, flattenMaps: true }
});

module.exports = mongoose.model('Message', messageSchema);
