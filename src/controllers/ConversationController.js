const ConversationService = require('../services/ConversationService');

const createGroup = async (req, res) => {
  try {
    const { name, adminId, memberIds } = req.body;
    const conv = await ConversationService.createGroup(name, adminId, memberIds);
    res.json({ success: true, data: conv });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const startDirect = async (req, res) => {
  try {
    const { user1Id, user2Id } = req.query;
    const conv = await ConversationService.startDirectConversation(user1Id, user2Id);
    res.json({ success: true, data: conv });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getUserConversations = async (req, res) => {
  try {
    const { userId } = req.query;
    const convs = await ConversationService.getUserConversations(userId);
    res.json({ success: true, data: convs });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const { broadcastToDestination } = require('../sockets/stompHandler');

const pinMessage = async (req, res) => {
  try {
    const { id } = req.params;
    const { message } = req.query;
    const success = await ConversationService.pinMessage(id, message);
    if (success) {
      broadcastToDestination('/topic/messages', {
        type: 'PIN_UPDATE',
        conversationId: id,
        pinnedMessage: message,
        createdAt: new Date().toISOString()
      });
    }
    res.json({ success, data: success ? 'Đã cập nhật tin nhắn ghim' : 'Lỗi hệ thống' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const addMember = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    const success = await ConversationService.addMember(id, userId);
    res.json({ success, data: success ? 'Thêm thành viên thành công' : 'Lỗi: Người dùng đã có trong nhóm hoặc lỗi hệ thống' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const leaveGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    const success = await ConversationService.leaveGroup(id, userId);
    res.json({ success, data: success ? 'Rời nhóm thành công' : 'Lỗi: Không thể rời nhóm' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateAvatar = async (req, res) => {
  try {
    const { id } = req.params;
    const { avatarUrl } = req.query;
    const conv = await ConversationService.updateAvatar(id, avatarUrl);
    if (conv) res.json({ success: true, data: conv });
    else res.status(404).json({ success: false, message: 'Not found' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const updateName = async (req, res) => {
  try {
    const { id } = req.params;
    const { name } = req.query;
    const conv = await ConversationService.updateName(id, name);
    if (conv) res.json({ success: true, data: conv });
    else res.status(404).json({ success: false, message: 'Not found' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const markAsRead = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    await ConversationService.resetUnreadCount(id, userId);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const toggleMute = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    const result = await ConversationService.toggleMute(id, userId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    await ConversationService.deleteConversation(id, userId);
    res.json({ success: true, data: 'Đã xóa hội thoại' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  createGroup,
  startDirect,
  getUserConversations,
  pinMessage,
  addMember,
  leaveGroup,
  updateAvatar,
  updateName,
  markAsRead,
  toggleMute,
  deleteConversation,
};
