const mongoose = require('mongoose');

const notificationSchema = new mongoose.Schema({
  userId: { type: String, required: true },
  type: { type: String }, // REMINDER, FRIEND_REQUEST, SYSTEM
  title: { type: String },
  content: { type: String },
  relatedId: { type: String }, // Event ID or User ID
  read: { type: Boolean, default: false },
  createdAt: { type: Date, default: Date.now }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Notification', notificationSchema);
