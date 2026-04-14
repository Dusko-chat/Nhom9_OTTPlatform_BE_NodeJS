const mongoose = require('mongoose');

const friendRequestSchema = new mongoose.Schema({
  senderId: { type: String, required: true },
  receiverId: { type: String, required: true },
  status: { type: String, default: 'PENDING' }, // PENDING, ACCEPTED, REJECTED
  createdAt: { type: Date, default: Date.now },
  senderName: { type: String },
  senderAvatar: { type: String }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('FriendRequest', friendRequestSchema);
