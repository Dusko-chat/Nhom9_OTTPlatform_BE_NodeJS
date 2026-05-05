const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const prisma = require('../config/prisma');
const Redis = require('ioredis');

// Redis client — dùng chung Upstash đã có sẵn trong .env
let redis = null;
try {
  redis = new Redis(process.env.REDIS_URL || {
    host: process.env.REDIS_HOST || '127.0.0.1',
    port: process.env.REDIS_PORT || 6379,
  }, {
    retryStrategy: (times) => {
      if (times > 3) return null;
      return Math.min(times * 50, 2000);
    }
  });
  redis.on('connect', () => console.log('[MessageCache] Redis connected'));
  redis.on('error', () => {}); // silent — fallback to MongoDB if Redis is down
} catch (_) {
  redis = null;
}

const MSG_CACHE_TTL = 60; // seconds — page 1 cached for 60s
const getMsgCacheKey = (conversationId) => `msgs:${conversationId}:p1`;

const saveMessage = async (messageData) => {
  const message = await Message.create(messageData);
  return message;
};

const getMessageById = async (id) => {
  return await Message.findById(id);
};

const getDeletedAtForUser = (deletedHistoryAt, userId) => {
  if (!deletedHistoryAt || !userId) return null;
  if (deletedHistoryAt instanceof Map) return deletedHistoryAt.get(userId);
  return deletedHistoryAt[userId] || null;
};

const getMessagesByConversationId = async (conversationId, userId, options = {}) => {
  const { cursor, limit } = options;
  const parsedLimit = Number.parseInt(limit, 10);
  const effectiveLimit = Number.isFinite(parsedLimit) && parsedLimit > 0
    ? Math.min(parsedLimit, 100)
    : null;

  // --- Redis cache: chỉ cache page đầu tiên (không có cursor) ---
  const cacheKey = getMsgCacheKey(conversationId);
  if (!cursor && redis) {
    try {
      const cached = await redis.get(cacheKey);
      if (cached) {
        console.log(`[MessageCache] HIT conv=${conversationId}`);
        return JSON.parse(cached);
      }
    } catch (_) {}
  }

  const conv = await Conversation.findById(conversationId).select('deletedHistoryAt').lean();
  const deleteAt = getDeletedAtForUser(conv?.deletedHistoryAt, userId);

  const query = { conversationId };
  if (deleteAt) {
    query.createdAt = { ...(query.createdAt || {}), $gt: new Date(deleteAt) };
  }

  if (cursor) {
    // cursor is a MongoDB ObjectId string (monotonically increasing, unique).
    // Fall back to createdAt date comparison for legacy cursors that are ISO strings.
    const mongoose = require('mongoose');
    if (mongoose.Types.ObjectId.isValid(cursor)) {
      query._id = { $lt: new mongoose.Types.ObjectId(cursor) };
    } else {
      const cursorDate = new Date(cursor);
      if (!Number.isNaN(cursorDate.getTime())) {
        query.createdAt = { ...(query.createdAt || {}), $lt: cursorDate };
      }
    }
  }

  let queryBuilder = Message.find(query).sort({ _id: -1 }).lean();
  if (effectiveLimit) {
    queryBuilder = queryBuilder.limit(effectiveLimit + 1);
  }

  let messages = await queryBuilder;
  let hasMore = false;

  if (effectiveLimit && messages.length > effectiveLimit) {
    hasMore = true;
    messages = messages.slice(0, effectiveLimit);
  }

  // 1. Collect sender IDs for batch fetching
  const senderIds = new Set();
  messages.forEach(msg => {
    if (msg.senderId !== 'SYSTEM' && (!msg.senderName || !msg.senderAvatar)) {
      senderIds.add(msg.senderId);
    }
  });

  // 2. Batch fetch user data from PostgreSQL
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(senderIds) } },
    select: { id: true, fullName: true, avatarUrl: true }
  });

  const userMap = users.reduce((acc, u) => {
    acc[u.id] = u;
    return acc;
  }, {});

  // 3. Fill user info
  const resultMessages = messages.map(msg => {
    const msgObj = { ...msg };
    // Ensure id is always a string for consistent frontend lookup
    msgObj.id = msgObj._id ? msgObj._id.toString() : (msgObj.id || '');
    if (msg.senderId === 'SYSTEM') {
      if (!msgObj.senderName) msgObj.senderName = 'Hệ thống';
    } else {
      const user = userMap[msg.senderId];
      if (user) {
        if (!msgObj.senderName) msgObj.senderName = user.fullName;
        if (!msgObj.senderAvatar) msgObj.senderAvatar = user.avatarUrl;
      }
    }
    return msgObj;
  });

  // API keeps chronological order for existing UI expectations
  resultMessages.reverse();

  // Use the _id of the OLDEST message in this batch as the next cursor.
  // After reverse(), resultMessages[0] is the oldest.
  const oldestMsg = resultMessages.length > 0 ? resultMessages[0] : null;
  const nextCursor = hasMore && oldestMsg
    ? (oldestMsg._id ? oldestMsg._id.toString() : null)
    : null;

  const result = {
    messages: resultMessages,
    pagination: {
      hasMore,
      nextCursor,
      limit: effectiveLimit
    }
  };

  // --- Lưu vào Redis (chỉ page đầu, không có cursor) ---
  if (!cursor && redis) {
    try {
      await redis.set(cacheKey, JSON.stringify(result), 'EX', MSG_CACHE_TTL);
      console.log(`[MessageCache] SET conv=${conversationId} TTL=${MSG_CACHE_TTL}s`);
    } catch (_) {}
  }

  return result;
};

/**
 * Xóa Redis cache của một conversation khi có tin nhắn mới.
 * Được gọi từ stompHandler sau khi broadcast tin nhắn.
 */
const invalidateMessageCache = async (conversationId) => {
  if (!conversationId || !redis) return;
  try {
    await redis.del(getMsgCacheKey(conversationId));
    console.log(`[MessageCache] INVALIDATED conv=${conversationId}`);
  } catch (_) {}
};

const clearHistoryForUser = async (conversationId, userId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv) {
    if (!conv.deletedHistoryAt) conv.deletedHistoryAt = new Map();
    conv.deletedHistoryAt.set(userId, new Date());
    await conv.save();
  }
};

const votePoll = async (messageId, userId, optionIndex) => {
  const message = await Message.findById(messageId);
  if (!message || message.type !== 'POLL') throw new Error('Poll not found');
  if (message.pollData.closed) throw new Error('Poll is closed');

  const { pollData } = message;
  
  if (!pollData.isMultiple) {
    pollData.options.forEach(opt => {
      opt.voters = opt.voters.filter(v => v !== userId);
    });
  }

  const option = pollData.options[optionIndex];
  if (!option) throw new Error('Invalid option');

  if (option.voters.includes(userId)) {
    option.voters = option.voters.filter(v => v !== userId);
  } else {
    option.voters.push(userId);
  }

  message.markModified('pollData');
  await message.save();
  return message;
};

const getPollDetails = async (messageId) => {
  const message = await Message.findById(messageId);
  if (!message || message.type !== 'POLL') throw new Error('Poll not found');

  // Collect all unique voter IDs
  const allVotersSet = new Set();
  message.pollData.options.forEach(opt => {
    opt.voters.forEach(vId => allVotersSet.add(vId));
  });

  // Batch fetch voters from PostgreSQL
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(allVotersSet) } },
    select: { id: true, fullName: true, avatarUrl: true }
  });

  const userMap = users.reduce((acc, u) => {
    acc[u.id] = u;
    return acc;
  }, {});

  const pollOptions = message.pollData.options.map(opt => {
    return {
      text: opt.text,
      voters: opt.voters.map(vId => userMap[vId]).filter(u => !!u)
    };
  });

  return {
    question: message.pollData.question,
    options: pollOptions
  };
};

const closePoll = async (messageId, userId) => {
  const message = await Message.findById(messageId);
  if (!message || message.type !== 'POLL') throw new Error('Poll not found');
  
  // Only creator can close
  if (message.senderId !== userId) throw new Error('Only creator can close poll');

  message.pollData.closed = true;
  message.markModified('pollData');
  await message.save();
  return message;
};

const markAsDelivered = async (messageId) => {
  const message = await Message.findById(messageId);
  if (message && message.status === 'SENT') {
    message.status = 'DELIVERED';
    await message.save();
    return message;
  }
  return null;
};

const markConversationAsSeen = async (conversationId, userId) => {
  const result = await Message.updateMany(
    { 
      conversationId, 
      senderId: { $ne: userId }, 
      status: { $in: ['SENT', 'DELIVERED'] } 
    },
    { $set: { status: 'SEEN' } }
  );
  return result;
};

const editMessage = async (messageId, newContent, userId) => {
  const message = await Message.findById(messageId);
  if (!message) throw new Error('Message not found');
  if (message.senderId !== userId) throw new Error('Only sender can edit message');
  if (message.type !== 'TEXT') throw new Error('Only text messages can be edited');

  message.content = newContent;
  message.isEdited = true;
  await message.save();

  // Update conversation preview if this is the latest message
  const newerMessage = await Message.findOne({
    conversationId: message.conversationId,
    createdAt: { $gt: message.createdAt }
  });

  if (!newerMessage) {
    await Conversation.findByIdAndUpdate(message.conversationId, {
      lastMessage: newContent
    });
  }

  return message;
};

const createSystemMessage = async (conversationId, content) => {
  const message = await Message.create({
    conversationId,
    senderId: 'SYSTEM',
    senderName: 'Hệ thống',
    content,
    type: 'SYSTEM',
    status: 'SENT'
  });
  return message;
};

module.exports = {
  saveMessage,
  getMessageById,
  getMessagesByConversationId,
  clearHistoryForUser,
  votePoll,
  getPollDetails,
  closePoll,
  markAsDelivered,
  markConversationAsSeen,
  editMessage,
  createSystemMessage,
  invalidateMessageCache,
};
