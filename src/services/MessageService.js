const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const prisma = require('../config/prisma');

const saveMessage = async (messageData) => {
  const message = await Message.create(messageData);
  return message;
};

const getMessageById = async (id) => {
  return await Message.findById(id);
};

const getMessagesByConversationId = async (conversationId, userId) => {
  let messages = await Message.find({ conversationId }).sort({ createdAt: 1 });

  const conv = await Conversation.findById(conversationId);
  const deleteAt = conv?.deletedHistoryAt?.get(userId);

  if (deleteAt) {
    messages = messages.filter((m) => m.createdAt > deleteAt);
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
    const msgObj = msg.toObject();
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

  return resultMessages;
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

module.exports = {
  saveMessage,
  getMessageById,
  getMessagesByConversationId,
  clearHistoryForUser,
  votePoll,
  getPollDetails,
  closePoll,
  markAsDelivered,
  markConversationAsSeen
};
