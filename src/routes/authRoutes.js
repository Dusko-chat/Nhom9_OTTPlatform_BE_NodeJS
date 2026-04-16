const express = require('express');
const router = express.Router();
const {
  register,
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  checkEmail,
  checkPhone,
  requestPasswordChangeOtp,
  confirmPasswordChange,
  requestDeleteAccountOtp,
  confirmDeleteAccount,
  requestLockAccountOtp,
  confirmLockAccount,
  requestUnlockOtp,
  confirmUnlock,
  logout
} = require('../controllers/AuthController');

const { protect } = require('../middleware/authMiddleware');

router.post('/check-email', checkEmail);
router.post('/check-phone', checkPhone);
router.post('/register', register);
router.post('/register/request-otp', requestRegisterOtp);
router.post('/register/verify-otp', verifyRegisterOtp);
router.post('/login', login);
router.post('/forgot-password/request-otp', requestForgotPasswordOtp);
router.post('/forgot-password/reset', resetPasswordWithOtp);
router.post('/change-password/request', protect, requestPasswordChangeOtp);
router.post('/change-password/confirm', protect, confirmPasswordChange);
router.post('/delete-account/request', protect, requestDeleteAccountOtp);
router.post('/delete-account/confirm', protect, confirmDeleteAccount);
router.post('/lock-account/request-otp', protect, requestLockAccountOtp);
router.post('/lock-account/confirm', protect, confirmLockAccount);
router.post('/unlock-account/request-otp', requestUnlockOtp);
router.post('/unlock-account/confirm', confirmUnlock);
router.post('/logout', protect, logout);

module.exports = router;
