const AuthService = require('../services/AuthService');
const stompHandler = require('../sockets/stompHandler');

const register = async (req, res) => {
  try {
    const result = await AuthService.requestRegisterOtp(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const requestRegisterOtp = async (req, res) => {
  try {
    const result = await AuthService.requestRegisterOtp(req.body);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const verifyRegisterOtp = async (req, res) => {
  try {
    const { email, otp } = req.body;
    const result = await AuthService.verifyRegisterOtp(email, otp);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const login = async (req, res) => {
  try {
    const { email, password } = req.body;
    const result = await AuthService.login(email, password);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const requestForgotPasswordOtp = async (req, res) => {
  try {
    const { email } = req.body;
    const result = await AuthService.requestForgotPasswordOtp(email);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const resetPasswordWithOtp = async (req, res) => {
  try {
    const { email, otp, newPassword } = req.body;
    const result = await AuthService.resetPasswordWithOtp(email, otp, newPassword);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const logout = async (req, res) => {
  try {
    const userId = req.user._id;
    const result = await AuthService.logout(userId);
    
    // Broadcast logout to all sockets for this user
    stompHandler.forceLogoutAllSessions(userId, 'Bạn đã đăng xuất.');
    
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  register,
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  resetPasswordWithOtp,
  checkEmail,
  checkPhone,
  requestPasswordChangeOtp,
  confirmPasswordChange,
  requestDeleteAccountOtp,
  confirmDeleteAccount,
  logout,
};

async function checkEmail(req, res) {
  try {
    const { email } = req.body;
    const result = await AuthService.checkEmailAvailability(email);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function checkPhone(req, res) {
  try {
    const { phoneNumber } = req.body;
    const result = await AuthService.checkPhoneAvailability(phoneNumber);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function requestPasswordChangeOtp(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const { currentPassword, newPassword } = req.body;
    const result = await AuthService.requestPasswordChangeOtp(userId, currentPassword, newPassword);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function confirmPasswordChange(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const { otp } = req.body;
    const result = await AuthService.confirmPasswordChange(userId, otp);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function requestDeleteAccountOtp(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const { password } = req.body;
    const result = await AuthService.requestDeleteAccountOtp(userId, password);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}

async function confirmDeleteAccount(req, res) {
  try {
    const userId = req.user.id || req.user._id;
    const { otp } = req.body;
    const result = await AuthService.confirmDeleteAccount(userId, otp);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
}
