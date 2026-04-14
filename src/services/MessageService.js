const Message = require('../models/Message');
const Conversation = require('../models/Conversation');
const User = require('../models/User');

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

  // Fill user info
  for (let msg of messages) {
    if (msg.senderId === 'SYSTEM') {
        if (!msg.senderName) msg.senderName = 'Hệ thống';
        continue;
    }
    if (!msg.senderName || !msg.senderAvatar) {
      const user = await User.findById(msg.senderId);
      if (user) {
        if (!msg.senderName) msg.senderName = user.fullName;
        if (!msg.senderAvatar) msg.senderAvatar = user.avatarUrl;
      }
    }
  }

  return messages;
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

  const pollOptions = [];
  for (let opt of message.pollData.options) {
    const voters = [];
    for (let vId of opt.voters) {
      const u = await User.findById(vId).select('fullName avatarUrl _id');
      if (u) voters.push(u);
    }
    pollOptions.push({
      text: opt.text,
      voters
    });
  }

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

module.exports = {
  saveMessage,
  getMessageById,
  getMessagesByConversationId,
  clearHistoryForUser,
  votePoll,
  getPollDetails,
  closePoll
};
