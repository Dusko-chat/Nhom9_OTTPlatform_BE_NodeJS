const mongoose = require('mongoose');

const callSchema = new mongoose.Schema({
  callerId: { type: String, required: true },
  receiverId: { type: String, required: true },
  startTime: { type: Date },
  endTime: { type: Date },
  status: { type: String } // completed, missed, cancelled
}, { timestamps: true });

module.exports = mongoose.model('Call', callSchema);
