const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { generateToken } = require('../utils/jwtUtils');
const nodemailer = require('nodemailer');
const { validatePassword } = require('../utils/validationUtils');
const { v4: uuidv4 } = require('uuid');

const registerOtpSessions = new Map();
const resetPasswordOtps = new Map();
const resetPasswordOtpExpiry = new Map();
const passwordChangeSessions = new Map();
const deleteAccountSessions = new Map();

const transporter = nodemailer.createTransport({
  host: process.env.MAIL_HOST,
  port: process.env.MAIL_PORT,
  auth: {
    user: process.env.MAIL_USERNAME,
    pass: process.env.MAIL_APP_PASSWORD,
  },
  connectionTimeout: 30000, // 30 seconds
  greetingTimeout: 30000,
  socketTimeout: 30000,
});

const generateOtp = () => {
  return Math.floor(100000 + Math.random() * 900000).toString();
};

const normalizeEmail = (email) => {
  return email ? email.trim().toLowerCase() : '';
};

// Check if email is already taken
const checkEmailAvailability = async (email) => {
  const normalized = normalizeEmail(email);
  if (!normalized) throw new Error('Email không hợp lệ');
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  return { available: !user };
};

// Check if phone number is already taken
const checkPhoneAvailability = async (phoneNumber) => {
  if (!phoneNumber) throw new Error('Số điện thoại không hợp lệ');
  const user = await prisma.user.findUnique({ where: { phoneNumber } });
  return { available: !user };
};

const requestRegisterOtp = async (userData) => {
  const email = normalizeEmail(userData.email);
  if (!email) throw new Error('Email không được để trống');
  
  const availability = await checkEmailAvailability(email);
  if (!availability.available) throw new Error('Email đã được sử dụng');

  if (userData.phoneNumber) {
    const phoneAvailability = await checkPhoneAvailability(userData.phoneNumber);
    if (!phoneAvailability.available) throw new Error('Số điện thoại đã được sử dụng');
  }

  if (!userData.password) throw new Error('Mật khẩu không được để trống');
  const passwordError = validatePassword(userData.password);
  if (passwordError) throw new Error(passwordError);

  if (!userData.fullName) throw new Error('Họ và tên không được để trống');

  const otp = generateOtp();
  const expiresAt = Date.now() + 60000; // 1 minute

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
    text: `Mã OTP của bạn là: ${otp}. Mã có hiệu lực trong 1 phút.`,
  });

  return {
    email,
    message: 'Đã gửi mã OTP xác thực đăng ký về email',
    expiresInSeconds: 60,
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

  const userExists = await prisma.user.findUnique({ where: { email: normalized } });
  if (userExists) {
    registerOtpSessions.delete(normalized);
    throw new Error('Email đã được sử dụng');
  }

  if (session.phoneNumber) {
    const phoneExists = await prisma.user.findUnique({ where: { phoneNumber: session.phoneNumber } });
    if (phoneExists) {
        registerOtpSessions.delete(normalized);
        throw new Error('Số điện thoại đã được sử dụng');
    }
  }

  try {
    const userId = uuidv4().replace(/-/g, '').substring(0, 24);
    const user = await prisma.user.create({
      data: {
        id: userId,
        email: normalized,
        password: session.password,
        fullName: session.fullName,
        phoneNumber: session.phoneNumber,
      }
    });

    registerOtpSessions.delete(normalized);
    return { userId: user.id, _id: user.id, message: 'Đăng ký thành công' };
  } catch (err) {
    throw err;
  }
};

const login = async (emailOrPhone, password) => {
  const normalizedEmail = normalizeEmail(emailOrPhone);
  const user = await prisma.user.findFirst({
    where: {
      OR: [
        { email: normalizedEmail },
        { phoneNumber: emailOrPhone }
      ]
    }
  });

  if (!user) throw new Error('Sai thông tin đăng nhập');
  if (user.isLocked) throw new Error('Tài khoản của bạn đã bị khóa bởi quản trị viên');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Sai mật khẩu đăng nhập');

  const sessionId = crypto.randomUUID();
  await prisma.user.update({
    where: { id: user.id },
    data: { currentSessionId: sessionId }
  });

  return {
    userId: user.id,
    _id: user.id,
    fullName: user.fullName,
    avatarUrl: user.avatarUrl,
    token: generateToken(user.id, user.role, sessionId),
    role: user.role,
  };
};

const requestForgotPasswordOtp = async (email) => {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error('Email không tồn tại trong hệ thống');

  const otp = generateOtp();
  const expiresAt = Date.now() + 60000; // 1 minute

  resetPasswordOtps.set(normalized, otp);
  resetPasswordOtpExpiry.set(normalized, expiresAt);

  await transporter.sendMail({
    from: process.env.MAIL_USERNAME,
    to: normalized,
    subject: 'Mã OTP đặt lại mật khẩu OTT App',
    text: `Mã OTP đặt lại mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 1 phút.`,
  });

  return { email: normalized, message: 'Mã OTP đã được gửi tới email' };
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

  const passwordError = validatePassword(newPassword);
  if (passwordError) throw new Error(passwordError);

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  await prisma.user.update({
    where: { email: normalized },
    data: { password: hashedPassword }
  });

  resetPasswordOtps.delete(normalized);
  resetPasswordOtpExpiry.delete(normalized);
  return { success: true, message: 'Đặt lại mật khẩu thành công' };
};

// 2-Step Password Change for Logged In Users
const requestPasswordChangeOtp = async (userId, currentPassword, newPassword) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Người dùng không tồn tại');

  const isMatch = await bcrypt.compare(currentPassword, user.password);
  if (!isMatch) throw new Error('Mật khẩu hiện tại không đúng');

  const passwordError = validatePassword(newPassword);
  if (passwordError) throw new Error(passwordError);

  const otp = generateOtp();
  const expiresAt = Date.now() + 60000; // 1 minute
  const newHashedPassword = await bcrypt.hash(newPassword, 10);

  passwordChangeSessions.set(userId, { otp, expiresAt, newHashedPassword });

  await transporter.sendMail({
    from: process.env.MAIL_USERNAME,
    to: user.email,
    subject: 'Xác nhận thay đổi mật khẩu OTT App',
    text: `Mã OTP xác nhận thay đổi mật khẩu của bạn là: ${otp}. Mã có hiệu lực trong 1 phút.`,
  });

  return { message: 'Mã OTP xác nhận đã được gửi tới email của bạn' };
};

const confirmPasswordChange = async (userId, otp) => {
  const session = passwordChangeSessions.get(userId);
  if (!session || Date.now() > session.expiresAt) {
    passwordChangeSessions.delete(userId);
    throw new Error('Mã OTP đã hết hạn hoặc không tồn tại');
  }

  if (session.otp !== otp) throw new Error('Mã OTP không chính xác');

  await prisma.user.update({
    where: { id: userId },
    data: { password: session.newHashedPassword }
  });

  passwordChangeSessions.delete(userId);
  return { success: true, message: 'Đổi mật khẩu thành công' };
};

// 2-Step Account Deletion
const requestDeleteAccountOtp = async (userId, password) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Người dùng không tồn tại');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Mật khẩu không đúng');

  const otp = generateOtp();
  const expiresAt = Date.now() + 60000; // 1 minute

  deleteAccountSessions.set(userId, { otp, expiresAt });

  await transporter.sendMail({
    from: process.env.MAIL_USERNAME,
    to: user.email,
    subject: 'Xác nhận xóa tài khoản OTT App',
    text: `Mã OTP xác nhận xóa tài khoản của bạn là: ${otp}. Lưu ý: Hành động này không thể hoàn tác. Mã có hiệu lực trong 1 phút.`,
  });

  return { message: 'Mã OTP xác nhận xóa tài khoản đã được gửi tới email của bạn' };
};

const confirmDeleteAccount = async (userId, otp) => {
  const session = deleteAccountSessions.get(userId);
  if (!session || Date.now() > session.expiresAt) {
    deleteAccountSessions.delete(userId);
    throw new Error('Mã OTP đã hết hạn hoặc không tồn tại');
  }

  if (session.otp !== otp) throw new Error('Mã OTP không chính xác');

  // Hard delete related data in MongoDB if necessary
  const Department = require('../models/Department');
  await Department.updateMany({ userIds: userId }, { $pull: { userIds: userId } });

  await prisma.user.delete({ where: { id: userId } });

  deleteAccountSessions.delete(userId);
  return { success: true, message: 'Tài khoản của bạn đã được xóa vĩnh viễn' };
};

const logout = async (userId) => {
  try {
    await prisma.user.update({
      where: { id: userId },
      data: { currentSessionId: null }
    });
    return { success: true };
  } catch (error) {
    return { success: false };
  }
};

module.exports = {
  checkEmailAvailability,
  checkPhoneAvailability,
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  requestPasswordChangeOtp,
  confirmPasswordChange,
  requestDeleteAccountOtp,
  confirmDeleteAccount,
  logout
};
