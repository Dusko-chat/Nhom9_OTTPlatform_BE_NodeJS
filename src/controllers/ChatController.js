const MessageService = require('../services/MessageService');

const getMessages = async (req, res) => {
  try {
    const { conversationId } = req.params;
    const { userId, cursor, limit } = req.query;
    
    // Đảm bảo limit là số nguyên hợp lệ, mặc định là 20 nếu không truyền
    const parsedLimit = parseInt(limit, 10) || 20;
    
    const result = await MessageService.getMessagesByConversationId(conversationId, userId, {
      cursor,
      limit: parsedLimit
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

const { broadcastToDestination } = require('../sockets/stompHandler');

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

module.exports = {
  getMessages,
  clearHistory,
  votePoll,
  getPollDetails,
  closePoll,
};
