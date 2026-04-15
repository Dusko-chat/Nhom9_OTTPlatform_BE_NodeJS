const express = require('express');
const router = express.Router();
const {
  register,
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  logout
} = require('../controllers/AuthController');

const { protect } = require('../middleware/authMiddleware');

router.post('/register', register);
router.post('/register/request-otp', requestRegisterOtp);
router.post('/register/verify-otp', verifyRegisterOtp);
router.post('/login', login);
router.post('/forgot-password/request-otp', requestForgotPasswordOtp);
router.post('/forgot-password/reset', resetPasswordWithOtp);
router.post('/logout', protect, logout);

module.exports = router;
