require('dotenv').config();
const mongoose = require('mongoose');
const Department = require('./src/models/Department');
const connectDB = require('./src/config/db');

async function seedDepartments() {
  await connectDB();
  
  const count = await Department.countDocuments();
  if (count === 0) {
    console.log('Seeding departments...');
    const root = await Department.create({
      name: 'IUH Campus',
      description: 'Tổng bộ IUH'
    });
    
    await Department.create({
      name: 'Phòng Đào tạo',
      parentId: root._id,
      description: 'Quản lý đào tạo'
    });
    
    await Department.create({
      name: 'Phòng Công tác Sinh viên',
      parentId: root._id,
      description: 'Hỗ trợ sinh viên'
    });
    
    console.log('Seeded successfully!');
  } else {
    console.log('Departments already exist.');
  }
  
  mongoose.connection.close();
}

seedDepartments();
