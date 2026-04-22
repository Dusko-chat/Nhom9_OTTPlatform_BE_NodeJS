const MessageService = require('../services/MessageService');
const ConversationService = require('../services/ConversationService');
const User = require('../models/User');

const setupChatSocket = (io) => {
  io.on('connection', (socket) => {
    console.log('User connected:', socket.id);

    // Join a general topic or specific rooms
    socket.on('join_topic', (topic) => {
      socket.join(topic);
    });

    socket.on('chat_message', async (chatMessage) => {
      const { type, conversationId, senderId, senderName, senderAvatar, content, targetMessageId, emoji, replyToId, replyToContent } = chatMessage;

      // 1. TYPING
      if (type === 'TYPING' || type === 'STOP_TYPING') {
        io.emit('messages', chatMessage); // Broadcast to everyone (or use rooms)
        return;
      }

      // 2. REACTION
      if (type === 'REACTION') {
        const msg = await MessageService.getMessageById(targetMessageId);
        if (msg) {
          if (!msg.reactions) msg.reactions = new Map();
          msg.reactions.set(senderId, emoji);
          await msg.save();
          io.emit('messages', msg);
        }
        return;
      }

      // 3. RECALL
      if (type === 'RECALL') {
        const msg = await MessageService.getMessageById(targetMessageId);
        if (msg && msg.senderId === senderId) {
          msg.type = 'RECALL';
          msg.content = 'Tin nhắn đã bị thu hồi';
          await msg.save();
          io.emit('messages', msg);
        }
        return;
      }

      // 4. New Message
      const savedMsg = await MessageService.saveMessage({
        conversationId,
        senderId,
        senderName,
        senderAvatar,
        content,
        type: type || 'TEXT',
        replyToId,
        replyToContent,
      });

      await ConversationService.updateLastMessage(conversationId, savedMsg.content, savedMsg.type, savedMsg.senderId);
      
      // Broadcast the message
      io.emit('messages', savedMsg);

      // Push Notification Logic (Simplified)
      // In a real app, you'd use a push service here
    });

    socket.on('disconnect', () => {
      console.log('User disconnected:', socket.id);
    });
  });
};

module.exports = setupChatSocket;
