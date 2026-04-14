const bcrypt = require('bcryptjs');
const User = require('../models/User');
const { generateToken } = require('../utils/jwtUtils');
const nodemailer = require('nodemailer');

const registerOtpSessions = new Map();
const resetPasswordOtps = new Map();
const resetPasswordOtpExpiry = new Map();

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_APP_PASSWORD,
  },
});

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const normalizeEmail = (email) => {
  return email ? email.trim().toLowerCase() : '';
};

const requestRegisterOtp = async (userData) => {
  const email = normalizeEmail(userData.email);
  if (!email) throw new Error('Email không được để trống');
  if (!userData.password) throw new Error('Mật khẩu không được để trống');
  if (!userData.fullName) throw new Error('Họ và tên không được để trống');

  const userExists = await User.findOne({ email });
  if (userExists) throw new Error('Email đã được sử dụng');

  const otp = generateOtp();
  const expiresAt = Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || 5) * 60000;

  const hashedPassword = await bcrypt.hash(userData.password, 10);

  registerOtpSessions.set(email, {
    fullName: userData.fullName.trim(),
    phoneNumber: userData.phoneNumber,
    password: hashedPassword,
    otp,
    expiresAt,
  });

  await transporter.sendMail({
    from: process.env.MAIL_USERNAME,
    to: email,
    subject: 'Mã OTP đăng ký OTT App',
    text: `Mã OTP của bạn là: ${otp}`,
  });

  return {
    email,
    message: 'Đã gửi mã OTP xác thực đăng ký về email',
    expiresInMinutes: process.env.OTP_EXPIRY_MINUTES,
  };
};

const verifyRegisterOtp = async (email, otp) => {
  const normalized = normalizeEmail(email);
  const session = registerOtpSessions.get(normalized);

  if (!session) throw new Error('Bạn chưa yêu cầu mã OTP đăng ký hoặc mã đã hết hạn');
  if (Date.now() > session.expiresAt) {
    registerOtpSessions.delete(normalized);
    throw new Error('Mã OTP đã hết hạn');
  }
  if (session.otp !== otp) throw new Error('Mã OTP không đúng');

  const userExists = await User.findOne({ email: normalized });
  if (userExists) {
    registerOtpSessions.delete(normalized);
    throw new Error('Email đã được sử dụng');
  }

  const user = await User.create({
    email: normalized,
    password: session.password,
    fullName: session.fullName,
    phoneNumber: session.phoneNumber,
  });

  registerOtpSessions.delete(normalized);

  return {
    userId: user._id,
    message: 'Đăng ký thành công',
  };
};

const login = async (emailOrPhone, password) => {
  const user = await User.findOne({
    $or: [{ email: normalizeEmail(emailOrPhone) }, { phoneNumber: emailOrPhone }],
  });

  if (!user) throw new Error('Sai thông tin đăng nhập');
  if (user.isLocked) throw new Error('Tài khoản của bạn đã bị khóa bởi quản trị viên');


  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Sai mật khẩu đăng nhập');

  return {
    userId: user._id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    token: generateToken(user._id, user.role),
    role: user.role,

  };
};

const requestForgotPasswordOtp = async (email) => {
  const normalized = normalizeEmail(email);
  const user = await User.findOne({ email: normalized });
  if (!user) throw new Error('Email không tồn tại trong hệ thống');

  const otp = generateOtp();
  const expiresAt = Date.now() + parseInt(process.env.OTP_EXPIRY_MINUTES || 5) * 60000;

  resetPasswordOtps.set(normalized, otp);
  resetPasswordOtpExpiry.set(normalized, expiresAt);

  await transporter.sendMail({
    from: process.env.MAIL_USERNAME,
    to: normalized,
    subject: 'Mã OTP đặt lại mật khẩu OTT App',
    text: `Mã OTP đặt lại mật khẩu của bạn là: ${otp}`,
  });

  return {
    email: normalized,
    message: 'Mã OTP đặt lại mật khẩu đã được gửi tới email',
  };
};

const resetPasswordWithOtp = async (email, otp, newPassword) => {
  const normalized = normalizeEmail(email);
  const storedOtp = resetPasswordOtps.get(normalized);
  const expiry = resetPasswordOtpExpiry.get(normalized);

  if (!storedOtp || !expiry || Date.now() > expiry) {
    resetPasswordOtps.delete(normalized);
    resetPasswordOtpExpiry.delete(normalized);
    throw new Error('Mã OTP đã hết hạn hoặc không tồn tại');
  }

  if (storedOtp !== otp) throw new Error('Mã OTP không chính xác');

  const user = await User.findOne({ email: normalized });
  if (!user) throw new Error('Người dùng không tồn tại');

  user.password = await bcrypt.hash(newPassword, 10);
  await user.save();

  resetPasswordOtps.delete(normalized);
  resetPasswordOtpExpiry.delete(normalized);

  return { success: true, message: 'Đặt lại mật khẩu thành công' };
};

module.exports = {
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
};
