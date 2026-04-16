const bcrypt = require('bcryptjs');
const crypto = require('crypto');
const prisma = require('../config/prisma');
const { generateToken } = require('../utils/jwtUtils');
const nodemailer = require('nodemailer');
const { validatePassword } = require('../utils/validationUtils');
const { v4: uuidv4 } = require('uuid');
const stompHandler = require('../sockets/stompHandler');

const registerOtpSessions = new Map();
const resetPasswordOtps = new Map();
const resetPasswordOtpExpiry = new Map();
const passwordChangeSessions = new Map();
const deleteAccountSessions = new Map();
const lockAccountSessions = new Map();
const unlockAccountSessions = new Map();

// Helper to log security events
const logSecurityEvent = async (userId, action, req, metadata = {}) => {
  try {
    const ip = req?.headers['x-forwarded-for'] || req?.connection?.remoteAddress;
    const device = req?.headers['user-agent'];
    await prisma.securityLog.create({
      data: { userId, action, ip, device, metadata }
    });
  } catch (err) {
    console.error('Failed to log security event:', err);
  }
};

const getCooldownMinutes = (count) => {
  if (count <= 1) return 30;
  if (count === 2) return 120; // 2h
  return 1440; // 24h
};

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
  
  if (user.isLocked) {
    const remainingCooldown = user.lockReason === 'AUTO' && user.lockedAt 
      ? Math.max(0, (new Date(user.lockedAt).getTime() + getCooldownMinutes(user.autoLockCount) * 60000) - Date.now())
      : 0;

    const error = new Error('Tài khoản của bạn đang bị khóa');
    error.isLocked = true;
    error.lockReason = user.lockReason;
    error.lockedAt = user.lockedAt;
    error.remainingCooldown = remainingCooldown;
    throw error;
  }

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

const requestLockAccountOtp = async (userId, password, req) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) throw new Error('Người dùng không tồn tại');

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Mật khẩu không chính xác');

  const otp = generateOtp();
  const expiresAt = Date.now() + 300000; // 5 minutes

  lockAccountSessions.set(userId, { otp, expiresAt });

  await transporter.sendMail({
    from: process.env.MAIL_USERNAME,
    to: user.email,
    subject: 'Xác nhận khóa tài khoản OTT App',
    text: `Mã OTP xác nhận khóa tài khoản của bạn là: ${otp}. Lưu ý: Sau khi khóa, bạn sẽ bị đăng xuất khỏi tất cả thiết bị. Mã có hiệu lực trong 5 phút.`,
  });

  await logSecurityEvent(userId, 'REQUEST_LOCK_OTP', req);
  return { message: 'Mã OTP xác nhận khóa tài khoản đã được gửi tới email của bạn' };
};

const confirmLockAccount = async (userId, otp, req) => {
  const session = lockAccountSessions.get(userId);
  if (!session || Date.now() > session.expiresAt) {
    lockAccountSessions.delete(userId);
    throw new Error('Mã OTP đã hết hạn hoặc không tồn tại');
  }

  if (session.otp !== otp) throw new Error('Mã OTP không chính xác');

  console.log(`[AuthService] Attempting to lock account for userId: ${userId}`);
  
  if (!userId) {
    throw new Error('UserId không hợp lệ');
  }

  try {
    await prisma.user.update({
      where: { id: userId.toString() },
      data: { 
        isLocked: true, 
        lockReason: 'USER', 
        lockDescription: 'Khóa theo yêu cầu của người dùng',
        lockedAt: new Date(),
        currentSessionId: null 
      }
    });
  } catch (dbError) {
    console.error('[AuthService] Prisma Update Error:', dbError);
    throw dbError; // Re-throw to be caught by controller
  }

  // Force logout all socket sessions
  stompHandler.forceLogoutAllSessions(userId, 'Tài khoản đã bị khóa theo yêu cầu của bạn.');

  await logSecurityEvent(userId, 'LOCK_ACCOUNT_SUCCESS', req, { reason: 'USER' });
  lockAccountSessions.delete(userId);
  return { success: true, message: 'Tài khoản của bạn đã được khóa thành công' };
};

const requestUnlockOtp = async (email, password, req) => {
  const normalized = normalizeEmail(email);
  const user = await prisma.user.findUnique({ where: { email: normalized } });
  if (!user) throw new Error('Sai thông tin đăng nhập');

  if (!user.isLocked) throw new Error('Tài khoản không bị khóa');
  if (user.lockReason === 'ADMIN') throw new Error('Tài khoản bị khóa bởi quản trị viên. Vui lòng liên hệ hỗ trợ.');

  // If AUTO lock, check cooldown
  if (user.lockReason === 'AUTO' && user.lockedAt) {
    const cooldownMs = getCooldownMinutes(user.autoLockCount) * 60000;
    const timePassed = Date.now() - new Date(user.lockedAt).getTime();
    if (timePassed < cooldownMs) {
      const remainingSec = Math.ceil((cooldownMs - timePassed) / 1000);
      throw new Error(`Tài khoản đang trong thời gian chờ vi phạm. Vui lòng thử lại sau ${Math.ceil(remainingSec / 60)} phút.`);
    }
  }

  const isMatch = await bcrypt.compare(password, user.password);
  if (!isMatch) throw new Error('Sai mật khẩu đăng nhập');

  const otp = generateOtp();
  const expiresAt = Date.now() + 300000; // 5 minutes

  unlockAccountSessions.set(user.id, { otp, expiresAt, attempts: 0 });

  await transporter.sendMail({
    from: process.env.MAIL_USERNAME,
    to: user.email,
    subject: 'Mã OTP mở khóa tài khoản OTT App',
    text: `Mã OTP mở khóa tài khoản của bạn là: ${otp}. Mã có hiệu lực trong 5 phút.`,
  });

  await logSecurityEvent(user.id, 'REQUEST_UNLOCK_OTP', req);
  return { userId: user.id, message: 'Mã OTP mở khóa đã được gửi tới email của bạn' };
};

const confirmUnlock = async (userId, otp, req) => {
  if (!userId) {
    throw new Error('UserId không hợp lệ');
  }

  const session = unlockAccountSessions.get(userId.toString());
  if (!session || Date.now() > session.expiresAt) {
    unlockAccountSessions.delete(userId.toString());
    throw new Error('Mã OTP đã hết hạn hoặc không tồn tại');
  }

  session.attempts += 1;
  if (session.otp !== otp) {
    if (session.attempts >= 5) {
      unlockAccountSessions.delete(userId.toString());
      await logSecurityEvent(userId, 'UNLOCK_BRUTE_FORCE_PREVENTED', req, { attempts: session.attempts });
      throw new Error('Quá số lần nhập sai mã OTP. Vui lòng yêu cầu lại mã mới.');
    }
    await logSecurityEvent(userId, 'UNLOCK_FAILED_WRONG_OTP', req, { attempts: session.attempts });
    throw new Error(`Mã OTP không chính xác. Còn lại ${5 - session.attempts} lần thử.`);
  }

  const sessionId = crypto.randomUUID();
  const user = await prisma.user.update({
    where: { id: userId.toString() },
    data: { 
      isLocked: false, 
      lockReason: null, 
      lockedAt: null,
      unlockAttempts: 0,
      currentSessionId: sessionId
    }
  });

  unlockAccountSessions.delete(userId.toString());
  await logSecurityEvent(userId.toString(), 'UNLOCK_ACCOUNT_SUCCESS', req);

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

const autoLockAccount = async (userId, violationType, metadata = {}) => {
  const user = await prisma.user.findUnique({ where: { id: userId } });
  if (!user) return;

  const newAutoLockCount = (user.autoLockCount || 0) + 1;
  const reason = metadata.reason || (violationType === 'SPAM' ? 'Phát hiện spam liên tục' : 'Vi phạm quy tắc cộng đồng');
  
  await prisma.user.update({
    where: { id: userId },
    data: {
      isLocked: true,
      lockReason: 'AUTO',
      lockDescription: reason,
      lockedAt: new Date(),
      autoLockCount: newAutoLockCount,
      currentSessionId: null
    }
  });

  // Create an automated SECURITY report in MongoDB
  try {
    const Report = require('../models/Report');
    const newReport = await Report.create({
        userId: userId,
        title: `[HỆ THỐNG] Khóa tài khoản: ${user.fullName}`,
        description: `Tài khoản bị hệ thống tự động khóa do đạt giới hạn vi phạm. Lý do: ${reason}. Lần khóa thứ: ${newAutoLockCount}`,
        type: 'SECURITY',
        status: 'PENDING'
    });

    // Notify all admins via WebSocket
    await notifyAdminsOfSecurityEvent({
        eventType: 'NEW_REPORT',
        ...newReport.toObject(),
        _id: newReport._id.toString()
    });
  } catch (err) {
    console.error('[AuthService] Failed to create security report:', err);
  }

  // Log the event in SecurityLog
  await logSecurityEvent(userId, 'AUTO_LOCK_VIOLATION', null, {
    violationType,
    autoLockCount: newAutoLockCount,
    reason,
    ...metadata
  });

  // Force logout
  stompHandler.forceLogoutAllSessions(userId, `Tài khoản của bạn đã bị khóa tự động do vi phạm: ${reason}.`);
};

const notifyAdminsOfSecurityEvent = async (eventData) => {
    try {
        const admins = await prisma.user.findMany({
            where: {
                role: { in: ['ADMIN', 'SUPER_ADMIN'] }
            }
        });

        admins.forEach(admin => {
            stompHandler.broadcastToDestination(`/topic/admin/reports`, eventData);
        });
    } catch (err) {
        console.error('[AuthService] Failed to notify admins:', err);
    }
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
  requestLockAccountOtp,
  confirmLockAccount,
  requestUnlockOtp,
  confirmUnlock,
  autoLockAccount,
  logout
};
