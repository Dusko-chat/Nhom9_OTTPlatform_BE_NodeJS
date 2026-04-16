const express = require('express');
const router = express.Router();
const {
  resetPasswordWithOtp,
  checkEmail,
  requestPasswordChangeOtp,
  confirmPasswordChange,
  requestDeleteAccountOtp,
  confirmDeleteAccount,
  logout
} = require('../controllers/AuthController');

const { protect } = require('../middleware/authMiddleware');

router.post('/check-email', checkEmail);
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
router.post('/logout', protect, logout);

module.exports = router;
