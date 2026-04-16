const prisma = require('../config/prisma');
const bcrypt = require('bcryptjs');
const { validatePassword } = require('../utils/validationUtils');
const PresenceService = require('../services/PresenceService');

const getUser = async (req, res) => {
  try {
    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    
    const { password, ...userWithoutPassword } = user;
    res.json({ success: true, data: userWithoutPassword });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const data = {};
    if (req.body.fullName) data.fullName = req.body.fullName;
    if (req.body.phoneNumber) data.phoneNumber = req.body.phoneNumber;
    if (req.body.avatarUrl) data.avatarUrl = req.body.avatarUrl;

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: data
    });

    const { password, ...userWithoutPassword } = user;
    res.json({ success: true, message: 'Cập nhật thành công', data: userWithoutPassword });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const changePassword = async (req, res) => {
  try {
    const { currentPassword, newPassword, confirmPassword } = req.body;
    if (!currentPassword) return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu hiện tại' });
    if (!newPassword) return res.status(400).json({ success: false, message: 'Vui lòng nhập mật khẩu mới' });
    
    const passwordError = validatePassword(newPassword);
    if (passwordError) return res.status(400).json({ success: false, message: passwordError });

    if (newPassword !== confirmPassword) return res.status(400).json({ success: false, message: 'Mật khẩu mới và xác nhận mật khẩu không khớp' });

    const user = await prisma.user.findUnique({
      where: { id: req.params.id }
    });
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });

    const hashedPassword = await bcrypt.hash(newPassword, 10);
    await prisma.user.update({
      where: { id: req.params.id },
      data: { password: hashedPassword }
    });

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getUsersByIds = async (req, res) => {
  try {
    const ids = req.body;
    const users = await prisma.user.findMany({
      where: { id: { in: ids } }
    });
    
    const sanitizedUsers = users.map(u => {
      const { password, ...noPassword } = u;
      return noPassword;
    });

    res.json({ success: true, data: sanitizedUsers });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const searchUser = async (req, res) => {
  try {
    const query = req.query.query || req.query.email;
    if (!query) return res.json({ success: true, data: [] });

    const searchTerm = query.trim();
    const user = await prisma.user.findFirst({
      where: {
        OR: [
          { email: searchTerm },
          { phoneNumber: searchTerm }
        ]
      }
    });

    const results = [];
    if (user) {
      const status = await PresenceService.getUserStatus(user.id);
      results.push({
        id: user.id,
        email: user.email,
        fullName: user.fullName || user.email || 'User',
        avatarUrl: user.avatarUrl || '',
        status: status
      });
    }

    res.json({ success: true, data: results });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getAllUsers = async (req, res) => {
  try {
    const users = await prisma.user.findMany();
    const usersWithStatus = await Promise.all(users.map(async (user) => {
      const status = await PresenceService.getUserStatus(user.id);
      const { password, ...userWithoutPassword } = user;
      return {
        ...userWithoutPassword,
        status: status
      };
    }));
    res.json({ success: true, data: usersWithStatus });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updatePushToken = async (req, res) => {
  try {
    const { token } = req.body;
    await prisma.user.update({
      where: { id: req.params.id },
      data: { pushToken: token }
    });
    res.json({ success: true, message: 'Cập nhật Push Token thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const lockUser = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isLocked: true }
    });
    res.json({ success: true, message: 'Khóa tài khoản thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const unlockUser = async (req, res) => {
  try {
    await prisma.user.update({
      where: { id: req.params.id },
      data: { isLocked: false }
    });
    res.json({ success: true, message: 'Mở khóa tài khoản thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    // Cleanup department references in MongoDB
    const Department = require('../models/Department');
    await Department.updateMany({ userIds: userId }, { $pull: { userIds: userId } });
    
    await prisma.user.delete({
      where: { id: userId }
    });
    res.json({ success: true, message: 'Xóa tài khoản thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { role: newRole } = req.body;
    const allowedRoles = ['GUEST', 'MEMBER', 'MANAGER']; // Adjusted if needed

    const user = await prisma.user.update({
      where: { id: req.params.id },
      data: { role: newRole }
    });

    const { password, ...userWithoutPassword } = user;
    res.json({ success: true, message: 'Cập nhật quyền thành công', data: userWithoutPassword });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteMe = async (req, res) => {
  try {
    const userId = req.user.id;
    // Cleanup department references in MongoDB
    const Department = require('../models/Department');
    await Department.updateMany({ userIds: userId }, { $pull: { userIds: userId } });
    
    await prisma.user.delete({
      where: { id: userId }
    });
    res.json({ success: true, message: 'Tài khoản của bạn đã được xóa vĩnh viễn' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getUser,
  updateProfile,
  changePassword,
  getUsersByIds,
  searchUser,
  getAllUsers,
  updatePushToken,
  lockUser,
  unlockUser,
  deleteUser,
  deleteMe,
  updateUserRole,
};

module.exports = {
  getUser,
  updateProfile,
  changePassword,
  getUsersByIds,
  searchUser,
  getAllUsers,
  updatePushToken,
  lockUser,
  unlockUser,
  deleteUser,
  deleteMe,
  updateUserRole,
};


