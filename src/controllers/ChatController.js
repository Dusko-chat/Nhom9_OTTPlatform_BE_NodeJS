const MessageService = require('../services/MessageService');

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, cursor, limit } = req.query;
    const result = await MessageService.getMessagesByConversationId(conversationId, userId, {
      cursor,
      limit
    });
    res.json({ success: true, data: result.messages, pagination: result.pagination });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const clearHistory = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId } = req.query;
    await MessageService.clearHistoryForUser(conversationId, userId);
    res.json({ success: true, data: 'Đã xóa lịch sử chat cho bạn' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const { broadcastToDestination, normalizeMentions } = require('../sockets/stompHandler');

const votePoll = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, optionIndex } = req.body;
    const message = await MessageService.votePoll(messageId, userId, optionIndex);
    
    // Broadcast update to all participants
    broadcastToDestination('/topic/messages', message);
    
    res.json({ success: true, data: message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getPollDetails = async (req, res) => {
  try {
    const { messageId } = req.params;
    const details = await MessageService.getPollDetails(messageId);
    res.json({ success: true, data: details });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const closePoll = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId } = req.body;
    const message = await MessageService.closePoll(messageId, userId);
    
    // Broadcast update
    broadcastToDestination('/topic/messages', message);
    
    res.json({ success: true, data: message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const editMessage = async (req, res) => {
  try {
    const { messageId } = req.params;
    const { userId, newContent } = req.body;
    const message = await MessageService.editMessage(messageId, newContent, userId);
    
    // Broadcast update
    broadcastToDestination('/topic/messages', Object.assign({}, message.toObject ? message.toObject() : message, { isEditEvent: true }));
    
    res.json({ success: true, data: message });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const sendMessage = async (req, res) => {
  try {
    const { conversationId, senderId, senderName, senderAvatar, content, type, replyToId, replyToContent, pollData, mentions } = req.body;

    // Basic permission check for groups
    if (conversationId) {
      try {
        const conv = await require('../services/ConversationService').getConversationById(conversationId);
        if (conv && conv.isGroup) {
          const isAdminOrDeputy = String(conv.adminId) === String(senderId) || (conv.deputyIds && conv.deputyIds.includes(senderId));
          if (conv.permissions?.sendMessages === 'ADMINS' && !isAdminOrDeputy && senderId !== 'SYSTEM') {
            return res.status(403).json({ success: false, message: 'Không có quyền gửi tin nhắn trong nhóm này' });
          }
        }
      } catch (e) { /* ignore and continue */ }
    }

    // Moderation for text
    if (senderId !== 'SYSTEM' && (type === 'TEXT' || !type)) {
      const ModerationService = require('../services/ModerationService');
      const mod = await ModerationService.checkMessage(senderId, content || '', module.exports);
      if (!mod.allowed) return res.status(403).json({ success: false, message: 'Message blocked by moderation' });
    }

    // Augment missing sender info
    let finalSenderName = senderName;
    let finalSenderAvatar = senderAvatar;
    if (senderId !== 'SYSTEM' && (!finalSenderName || !finalSenderAvatar)) {
      try {
        const user = await require('../config/prisma').user.findUnique({ where: { id: senderId } });
        if (user) {
          finalSenderName = finalSenderName || user.fullName;
          finalSenderAvatar = finalSenderAvatar || user.avatarUrl;
        }
      } catch (e) {}
    }

    // Normalize mentions server-side before saving
    let normalizedMentions = [];
    try {
      normalizedMentions = await normalizeMentions(Array.isArray(mentions) ? mentions : [], conversationId);
    } catch (e) {
      console.error('Failed to normalize mentions in REST send:', e && e.message ? e.message : e);
    }

    const saved = await MessageService.saveMessage({
      conversationId,
      senderId,
      senderName: finalSenderName,
      senderAvatar: finalSenderAvatar,
      content,
      type: type || 'TEXT',
      replyToId,
      replyToContent,
      pollData: pollData,
      mentions: normalizedMentions
    });

    const savedObj = saved.toJSON ? saved.toJSON() : saved;
    if (!savedObj.createdAt) savedObj.createdAt = new Date().toISOString();

    // Update conversation preview
    try { await require('../services/ConversationService').updateLastMessage(conversationId, content, savedObj.type, senderId); } catch (e) {}

    // Broadcast
    const { broadcastToDestination } = require('../sockets/stompHandler');
    broadcastToDestination('/topic/messages', savedObj);
    await MessageService.invalidateMessageCache(conversationId);

    res.json({ success: true, data: savedObj });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getMessages,
  clearHistory,
  votePoll,
  getPollDetails,
  closePoll,
  editMessage,
  sendMessage,
};
