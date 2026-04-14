const mongoose = require('mongoose');

const userSchema = new mongoose.Schema({
  email: { type: String, unique: true, sparse: true },
  phoneNumber: { type: String, unique: true, sparse: true },
  password: { type: String },
  fullName: { type: String },
  avatarUrl: { type: String },
  status: { type: String, default: 'OFFLINE' }, // ONLINE, OFFLINE, BUSY, AWAY
  lastSeen: { type: String },
  departmentId: { type: String },
  jobTitle: { type: String },
   role: { type: String, default: 'GUEST' }, // SUPER_ADMIN, MANAGER, GUEST, EMP...
   isLocked: { type: Boolean, default: false },
   pushToken: { type: String }

}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('User', userSchema);
