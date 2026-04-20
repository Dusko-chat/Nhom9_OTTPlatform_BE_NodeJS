const ConversationService = require('../services/ConversationService');
const MessageService = require('../services/MessageService');
const axios = require('axios');

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
    let pinData;

    // Support fallback to query parameter to prevent breaking old frontends immediately
    if (req.body && Object.keys(req.body).length > 0 && req.body.messageId) {
      pinData = req.body;
    } else {
      // Legacy structure - though we strongly recommend body
      pinData = {
        messageId: req.query.messageId || new Date().getTime().toString(),
        content: req.query.message || '',
        type: req.query.type || 'TEXT',
        senderName: req.query.senderName || 'Người dùng'
      };
    }

    const pinnedArrayOrFalse = await ConversationService.pinMessage(id, pinData);
    if (pinnedArrayOrFalse !== false) {
      broadcastToDestination('/topic/messages', {
        type: 'PIN_UPDATE',
        conversationId: id,
        pinnedMessages: pinnedArrayOrFalse,
        createdAt: new Date().toISOString()
      });
      res.json({ success: true, data: pinnedArrayOrFalse });
    } else {
      res.json({ success: false, data: 'Lỗi hệ thống' });
    }
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
    if (conv) {
      // Broadcast name update to all members
      broadcastToDestination('/topic/messages', {
        type: 'CONVERSATION_UPDATE',
        conversationId: id,
        name: name,
        updatedAt: new Date().toISOString()
      });
      res.json({ success: true, data: conv });
    }
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

const disbandGroup = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query; // Admin ID
    const result = await ConversationService.disbandGroup(id, userId);

    if (result.success) {
      // Broadcast to all members that the group is disbanded
      result.members.forEach(mid => {
        broadcastToDestination(`/topic/notifications/${mid}`, {
          type: 'GROUP_DISBANDED',
          conversationId: id,
          title: 'Nhóm đã giải tán',
          content: 'Trưởng nhóm đã giải tán cuộc trò chuyện này.',
          silent: false
        });
      });

      // Also broadcast to the message topic for instant UI removal if open
      broadcastToDestination(`/topic/messages`, {
        type: 'GROUP_DISBANDED',
        conversationId: id
      });

      res.json({ success: true, data: 'Nhóm đã được giải tán' });
    } else {
      res.status(403).json({ success: false, message: result.message });
    }
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

const transferAdmin = async (req, res) => {
  try {
    const { id } = req.params;
    const { adminId, newAdminId } = req.body;

    const success = await ConversationService.transferAdmin(id, adminId, newAdminId);

    if (success) {
      // Broadcast to all members that the admin has changed
      broadcastToDestination(`/topic/messages`, {
        type: 'ADMIN_TRANSFERRED',
        conversationId: id,
        newAdminId: newAdminId
      });
      res.json({ success: true, data: 'Đã nhường quyền trưởng nhóm' });
    } else {
      res.status(403).json({ success: false, message: 'Lỗi: Không thể nhường quyền trưởng nhóm' });
    }
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const togglePin = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;
    const result = await ConversationService.togglePin(id, userId);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const summarizeConversation = async (req, res) => {
  try {
    const { id } = req.params;
    const { userId } = req.query;

    // Get messages for this conversation
    const messages = await MessageService.getMessagesByConversationId(id, userId);

    // Filter TEXT messages, skip SYSTEM, CALL, RECALL, etc.
    const textMessages = messages.filter(m => m.type === 'TEXT');

    // Take the last 50
    const recentMessages = textMessages.slice(-20);

    if (recentMessages.length === 0) {
      return res.json({ success: true, data: 'Không có nội dung tin nhắn dạng văn bản nào để tóm tắt.' });
    }

    // Format messages for prompt
    const formattedMessages = recentMessages.map(m => `[${m.senderName || 'Người dùng'}]: ${m.content}`).join('\n');

    const apiKey = process.env.GEMINI_API_KEY;
    if (!apiKey) {
      return res.status(500).json({ success: false, message: 'Thiếu API Key AI.' });
    }

    const systemInstruction = `Bạn là trợ lý AI chuyên tóm tắt hội thoại trong ứng dụng chat.
Nhiệm vụ: Tóm tắt cuộc trò chuyện một cách ngắn gọn, rõ ràng. Giữ lại các ý chính, quyết định quan trọng, hành động cần làm.
Yêu cầu:
- Viết bằng tiếng Việt
- Dạng bullet point (gạch đầu dòng)
- Tối đa 5-7 ý
- Ngắn gọn, dễ đọc`;

    const response = await axios.post(
      `https://generativelanguage.googleapis.com/v1beta/models/gemini-2.5-flash:generateContent?key=${apiKey}`,
      {
        system_instruction: { parts: [{ text: systemInstruction }] },
        contents: [{ parts: [{ text: `Dưới đây là một đoạn hội thoại chat:\n\n${formattedMessages}\n\nHãy tóm tắt nó theo yêu cầu.` }] }]
      },
      {
        timeout: 30000,
        headers: { 'Content-Type': 'application/json' }
      }
    );

    const aiResponse = response.data?.candidates?.[0]?.content?.parts?.[0]?.text || "Không thể tạo tóm tắt vào lúc này.";

    res.json({ success: true, data: aiResponse });
  } catch (error) {
    console.error('[AI Summarize] Request Failed:', error.response?.data || error.message);
    res.status(500).json({ success: false, message: 'Lỗi khi gọi AI.' });
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
  disbandGroup,
  transferAdmin,
  togglePin,
  summarizeConversation,
};
