const mongoose = require('mongoose');

const eventSchema = new mongoose.Schema({
  title: { type: String, required: true },
  description: { type: String },
  type: { type: String, default: 'WORK' },
  time: { type: String },
  location: { type: String },
  zoomId: { type: String },
  zoomPassword: { type: String },
  day: { type: Number, required: true },
  month: { type: Number, required: true },
  year: { type: Number, required: true },
  creatorId: { type: String },
  reminder1DaySent: { type: Boolean, default: false },
  reminder1HourSent: { type: Boolean, default: false }
}, { 
  timestamps: true,
  toJSON: { virtuals: true },
  toObject: { virtuals: true }
});

module.exports = mongoose.model('Event', eventSchema);
