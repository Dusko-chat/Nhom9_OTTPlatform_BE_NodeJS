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
  
  const passwordError = validatePassword(userData.password);
  if (passwordError) throw new Error(passwordError);

  if (!userData.fullName) throw new Error('Họ và tên không được để trống');

  const userExists = await prisma.user.findUnique({ where: { email } });
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

  const userExists = await prisma.user.findUnique({ where: { email: normalized } });
  if (userExists) {
    registerOtpSessions.delete(normalized);
    throw new Error('Email đã được sử dụng');
  }

  // Generate a MongoDB-like ID if it's a new user, or a simple unique string
  // To keep it consistent with other IDs, we can use a UUID or similar
  const user = await prisma.user.create({
    data: {
      id: uuidv4().replace(/-/g, '').substring(0, 24), // Mocking ObjectID-like string length
      email: normalized,
      password: session.password,
      fullName: session.fullName,
      phoneNumber: session.phoneNumber,
    }
  });

  registerOtpSessions.delete(normalized);

  return {
    userId: user.id,
    message: 'Đăng ký thành công',
  };
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

  const passwordError = validatePassword(newPassword);
  if (passwordError) throw new Error(passwordError);

  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error('Người dùng không tồn tại');

  const hashedPassword = await bcrypt.hash(newPassword, 10);
  
  await prisma.user.update({
    where: { id: user.id },
    data: { password: hashedPassword }
  });

  resetPasswordOtps.delete(normalized);
  resetPasswordOtpExpiry.delete(normalized);

  return { success: true, message: 'Đặt lại mật khẩu thành công' };
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
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  logout
};

module.exports = {
  requestRegisterOtp,
  verifyRegisterOtp,
  login,
  requestForgotPasswordOtp,
  resetPasswordWithOtp,
  logout
};
