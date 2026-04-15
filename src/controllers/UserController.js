const User = require('../models/User');
const bcrypt = require('bcryptjs');
const { validatePassword } = require('../utils/validationUtils');

const getUser = async (req, res) => {
  try {
    const user = await User.findById(req.params.id).select('-password');
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });
    res.json({ success: true, data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateProfile = async (req, res) => {
  try {
    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    user.fullName = req.body.fullName || user.fullName;
    user.phoneNumber = req.body.phoneNumber || user.phoneNumber;
    if (req.body.avatarUrl) {
      user.avatarUrl = req.body.avatarUrl;
    }

    await user.save();
    user.password = undefined;
    res.json({ success: true, message: 'Cập nhật thành công', data: user });
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

    const user = await User.findById(req.params.id);
    if (!user) return res.status(404).json({ success: false, message: 'User not found' });

    const isMatch = await bcrypt.compare(currentPassword, user.password);
    if (!isMatch) return res.status(400).json({ success: false, message: 'Mật khẩu hiện tại không đúng' });

    user.password = await bcrypt.hash(newPassword, 10);
    await user.save();

    res.json({ success: true, message: 'Đổi mật khẩu thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getUsersByIds = async (req, res) => {
  try {
    const users = await User.find({ _id: { $in: req.body } }).select('-password');
    res.json({ success: true, data: users });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const PresenceService = require('../services/PresenceService');

const searchUser = async (req, res) => {
  try {
    const query = req.query.query || req.query.email;
    if (!query) return res.json({ success: true, data: [] });

    const searchTerm = query.trim();
    let user = await User.findOne({ email: searchTerm }).select('email fullName avatarUrl status');
    if (!user) {
      user = await User.findOne({ phoneNumber: searchTerm }).select('email fullName avatarUrl status');
    }

    const results = [];
    if (user) {
      const status = await PresenceService.getUserStatus(user._id);
      results.push({
        id: user._id,
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
    const users = await User.find().select('-password');
    const usersWithStatus = await Promise.all(users.map(async (user) => {
      const status = await PresenceService.getUserStatus(user._id);
      return {
        ...user.toJSON(),
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
    await User.findByIdAndUpdate(req.params.id, { pushToken: token });
    res.json({ success: true, message: 'Cập nhật Push Token thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const lockUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isLocked: true });
    res.json({ success: true, message: 'Khóa tài khoản thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const unlockUser = async (req, res) => {
  try {
    await User.findByIdAndUpdate(req.params.id, { isLocked: false });
    res.json({ success: true, message: 'Mở khóa tài khoản thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteUser = async (req, res) => {
  try {
    const userId = req.params.id;
    // Cleanup department references
    const Department = require('../models/Department');
    await Department.updateMany({ userIds: userId }, { $pull: { userIds: userId } });
    
    await User.findByIdAndDelete(userId);
    res.json({ success: true, message: 'Xóa tài khoản thành công' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateUserRole = async (req, res) => {
  try {
    const { role: newRole } = req.body;
    const allowedRoles = ['USER', 'MANAGER'];

    if (!allowedRoles.includes(newRole)) {
      return res.status(400).json({ 
        success: false, 
        message: 'Không thể chuyển đổi sang quyền này (Admin/Super Admin) thông qua giao diện.' 
      });
    }

    const user = await User.findByIdAndUpdate(
      req.params.id, 
      { role: newRole }, 
      { new: true }
    ).select('-password');

    res.json({ success: true, message: 'Cập nhật quyền thành công', data: user });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteMe = async (req, res) => {
  try {
    const userId = req.user.id;
    // Cleanup department references
    const Department = require('../models/Department');
    await Department.updateMany({ userIds: userId }, { $pull: { userIds: userId } });
    
    await User.findByIdAndDelete(userId);
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


