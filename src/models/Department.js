const mongoose = require('mongoose');

const departmentSchema = new mongoose.Schema({
  name: { type: String, required: true },
  parentId: { type: String }, // Null nếu là gốc
  managerId: { type: String }, // ID của trưởng phòng/manager
  description: { type: String },
  userIds: [{ type: String, default: [] }]
}, { timestamps: true });

module.exports = mongoose.model('Department', departmentSchema);
