const mongoose = require('mongoose');

const attendanceSchema = new mongoose.Schema({
  userId: {
    type: mongoose.Schema.Types.ObjectId,
    ref: 'User',
    required: true
  },
  latitude: {
    type: Number,
    required: true
  },
  longitude: {
    type: Number,
    required: true
  },
  type: {
    type: String,
    enum: ['IN', 'OUT'],
    required: true
  },
  timestamp: {
    type: Date,
    default: Date.now
  },
  distance: {
    type: Number, // Distance from office in meters
    required: true
  },
  status: {
    type: String,
    enum: ['SUCCESS', 'OUT_OF_RANGE', 'FAILED'],
    default: 'SUCCESS'
  },
  note: {
    type: String
  }
}, { timestamps: true });

module.exports = mongoose.model('Attendance', attendanceSchema);
