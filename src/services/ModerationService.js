const prisma = require('../config/prisma');

// userId -> { count, lastMessageTime }
const messageHistory = new Map();
// userId -> strikeCount
const userStrikes = new Map();

// Basic profanity list (Vietnamese - Common words)
const BLOCKED_WORDS = [
  'đm', 'đmm', 'đjt', 'vcl', 'loz', 'lon', 'cac', 'cặc', 'đéo', 'deo',
  'ngu', 'óc chó', 'oc cho', 'chó', 'đồ ngu', 'ngu vcl'
];

const VIOLATION_LIMIT = 3; // 3 strikes and you're locked
const SPAM_THRESHOLD_MS = 2000; // 2 seconds between messages minimum for "clean" behavior
const SPAM_BURST_MAX = 5; // max 5 messages in 10 seconds
const SPAM_WINDOW_MS = 10000;

const spamHistory = new Map(); // userId -> [timestamps]

const checkMessage = async (userId, content, stompHandler) => {
  // 1. Check Profanity
  const hasProfanity = BLOCKED_WORDS.some(word =>
    content.toLowerCase().includes(word.toLowerCase())
  );

  if (hasProfanity) {
    return await handleViolation(userId, 'PROFANITY', stompHandler);
  }

  // 2. Check Spam
  if (isSpamming(userId)) {
    return await handleViolation(userId, 'SPAM', stompHandler);
  }

  return { allowed: true };
};

const isSpamming = (userId) => {
  const now = Date.now();
  if (!spamHistory.has(userId)) {
    spamHistory.set(userId, [now]);
    return false;
  }

  const timestamps = spamHistory.get(userId);
  // Remove old timestamps outside the window
  const recentTimestamps = timestamps.filter(ts => now - ts < SPAM_WINDOW_MS);
  recentTimestamps.push(now);
  spamHistory.set(userId, recentTimestamps);

  return recentTimestamps.length > SPAM_BURST_MAX;
};

const handleViolation = async (userId, type, stompHandler) => {
  const currentStrikes = (userStrikes.get(userId) || 0) + 1;
  userStrikes.set(userId, currentStrikes);

  console.log(`[Moderation] Violation detected for user ${userId}. Type: ${type}. Strike: ${currentStrikes}`);

  if (currentStrikes >= VIOLATION_LIMIT) {
    // Escalate to account lock
    await triggerAutoLock(userId, type, stompHandler);
    return { allowed: false, action: 'LOCKED' };
  } else {
    // Send warning to user
    const remaining = VIOLATION_LIMIT - currentStrikes;
    const warningMsg = type === 'SPAM'
      ? `Cảnh báo: Bạn đang gửi tin nhắn quá nhanh. Còn ${remaining} lần vi phạm nữa tài khoản sẽ bị khóa tự động.`
      : `Cảnh báo: Tin nhắn của bạn chứa nội dung không phù hợp. Còn ${remaining} lần vi phạm nữa tài khoản sẽ bị khóa tự động.`;

    stompHandler.broadcastToDestination(`/topic/notifications/${userId}`, {
      type: 'SYSTEM_WARNING',
      title: 'Cảnh báo hệ thống',
      content: warningMsg,
      violationType: type,
      createdAt: new Date().toISOString()
    });

    return { allowed: false, action: 'WARNED', message: warningMsg };
  }
};

const triggerAutoLock = async (userId, type, stompHandler) => {
  const AuthService = require('./AuthService');
  const reason = type === 'SPAM' ? 'Phát hiện spam liên tục' : 'Vi phạm quy tắc cộng đồng (ngôn từ thô tục)';

  try {
    await AuthService.autoLockAccount(userId, type, {
      reason,
      strikeCount: VIOLATION_LIMIT,
      ip: 'AUTOMATED_SYSTEM'
    });

    // Reset strikes after lock
    userStrikes.set(userId, 0);
    spamHistory.delete(userId);
  } catch (err) {
    console.error('[Moderation] Failed to auto lock account:', err);
  }
};

module.exports = {
  checkMessage
};
