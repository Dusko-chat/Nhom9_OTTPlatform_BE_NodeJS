const jwt = require('jsonwebtoken');
const MessageService = require('../services/MessageService');
const ConversationService = require('../services/ConversationService');
const PresenceService = require('../services/PresenceService');
const CallService = require('../services/CallService');
const prisma = require('../config/prisma');

const subscriptions = new Map(); // socketId -> Map(subId -> destination)
const sockets = new Map(); // socketId -> socket

const parseFrame = (data) => {
  const str = data.toString();
  const [headerPart, ...bodyParts] = str.split('\n\n');
  const body = bodyParts.join('\n\n').replace(/\0$/, '');
  const lines = headerPart.split('\n');
  if (lines.length === 0) return null;
  const command = lines[0].trim();
  const headers = {};
  for (let i = 1; i < lines.length; i++) {
    const colonIndex = lines[i].indexOf(':');
    if (colonIndex !== -1) {
      const key = lines[i].substring(0, colonIndex).trim();
      const value = lines[i].substring(colonIndex + 1).trim();
      headers[key] = value;
    }
  }
  return { command, headers, body };
};

const buildFrame = (command, headers, body = '') => {
  let frame = `${command}\n`;
  for (const key in headers) {
    frame += `${key}:${headers[key]}\n`;
  }
  frame += `\n${body}\0`;
  return frame;
};

const broadcastPresence = (userId, status) => {
  const update = {
    userId,
    status,
    timestamp: Math.floor(Date.now() / 1000).toString(),
  };
  broadcastToDestination('/topic/presence', update);
};

const setupStompSocket = (wss) => {
  wss.on('connection', (socket) => {
    const socketId = Math.random().toString(36).substring(7);
    sockets.set(socketId, socket);
    subscriptions.set(socketId, new Map());

    console.log('New WebSocket connection:', socketId);

    socket.on('message', async (data) => {
      try {
        const frame = parseFrame(data);
        if (!frame) return;
        
        if (frame.command === 'CONNECT') {
          const auth = frame.headers['Authorization'] || frame.headers['authorization'];
          if (auth && auth.startsWith('Bearer ')) {
            const token = auth.substring(7);
            try {
              const decoded = jwt.verify(token, process.env.JWT_SECRET);
              const userId = decoded.userId || decoded.id;
              
              // Verify user exists in database
              const user = await prisma.user.findUnique({
                where: { id: userId }
              });

              if (!user) {
                console.error(`STOMP Auth failed: User ${userId} not found in database`);
                socket.send(buildFrame('ERROR', { message: 'USER_NOT_FOUND' }, 'Người dùng không tồn tại trong hệ thống.'));
                setTimeout(() => socket.close(), 100);
                return;
              }

              socket.userId = userId;
              socket.sessionId = decoded.sessionId;
              
              console.log(`STOMP User Authenticated: ${socket.userId} (Session: ${socket.sessionId})`);

              // Force logout other sessions
              sockets.forEach((s, sid) => {
                if (s.userId === socket.userId && s.sessionId !== socket.sessionId) {
                  console.log(`Force logout old session for user ${socket.userId}: ${sid}`);
                  s.send(buildFrame('ERROR', { message: 'SESSION_FORCE_LOGOUT' }, 'Tài khoản đã được đăng nhập từ một thiết bị khác.'));
                  setTimeout(() => s.close(), 100);
                }
              });

              await PresenceService.setOnline(socket.userId, broadcastPresence);
              
              // ONLY send CONNECTED after authentication success
              socket.send(buildFrame('CONNECTED', { version: '1.2' }));
            } catch (e) {
              console.error('STOMP Auth failed:', e.message);
              socket.send(buildFrame('ERROR', { message: 'INVALID_TOKEN' }, 'Phiên làm việc không hợp lệ.'));
              setTimeout(() => socket.close(), 100);
              return;
            }
          } else {
            console.error('STOMP CONNECT failed: Missing Authorization header');
            socket.send(buildFrame('ERROR', { message: 'MISSING_AUTH' }, 'Thiếu thông tin xác thực.'));
            setTimeout(() => socket.close(), 100);
            return;
          }
        } else if (frame.command === 'SUBSCRIBE') {
          const destination = frame.headers['destination'];
          const subId = frame.headers['id'];
          if (destination && subId) {
            subscriptions.get(socketId).set(subId, destination);
            console.log(`Socket ${socketId} subscribed to ${destination} (subId: ${subId})`);
          }
        } else if (frame.command === 'UNSUBSCRIBE') {
          const subId = frame.headers['id'];
          if (subId) {
            subscriptions.get(socketId).delete(subId);
            console.log(`Socket ${socketId} unsubscribed subId: ${subId}`);
          }
        } else if (frame.command === 'SEND') {
          const destination = frame.headers['destination'];
          let body;
          try {
            body = JSON.parse(frame.body);
          } catch (e) {
            console.error('Failed to parse SEND body:', frame.body);
            return;
          }

          if (destination === '/app/chat') {
            await handleChatMessage(body);
          } else if (destination === '/app/typing') {
            if (body.conversationId) {
              broadcastToDestination(`/topic/typing/${body.conversationId}`, body);
            }
          } else if (destination === '/app/chat.edit') {
            try {
              const { messageId, content, conversationId } = body;
              const editedMessage = await MessageService.editMessage(messageId, content, socket.userId);
              // Broadcast the updated message so all clients update their UI
              broadcastToDestination('/topic/messages', Object.assign({}, editedMessage.toObject ? editedMessage.toObject() : editedMessage, { isEditEvent: true }));
            } catch (err) {
              console.error("Failed to edit message via STOMP:", err.message);
            }
          } else if (destination === '/app/call.signal') {
            const toId = body.toId || body.receiverId;
            if (toId) {
              broadcastToDestination(`/topic/calls/${toId}`, body);
            } else if (body.conversationId) {
              broadcastToDestination(`/topic/calls/group/${body.conversationId}`, body);
            }
          } else if (destination === '/app/call.join') {
             const { conversationId } = body;
             if (conversationId && socket.userId) {
                socket.activeCallConversationId = conversationId;
                const participants = CallService.joinCall(conversationId, socket.userId);
                
                // Broadcast for WebRTC signaling
                broadcastToDestination(`/topic/calls/group/${conversationId}`, {
                   type: 'joined',
                   userId: socket.userId,
                   participants: participants
                });

                // Send a system message to chat ONLY if it's a group conversation
                try {
                   const conv = await ConversationService.getConversationById(conversationId);
                   if (conv && conv.isGroup) {
                      const user = await prisma.user.findUnique({
                        where: { id: socket.userId }
                      });
                      const userName = user ? user.fullName : 'Thành viên';
                      const joinMsg = {
                         conversationId,
                         senderId: 'SYSTEM',
                         senderName: 'Hệ thống',
                         content: `${userName} đã tham gia cuộc gọi`,
                         type: 'CALL_JOIN',
                         createdAt: new Date()
                      };
                      const savedMsg = await MessageService.saveMessage(joinMsg);
                      broadcastToDestination('/topic/messages', savedMsg);
                   }
                } catch (err) {
                   console.error("Failed to send join notification:", err);
                }
             }
          } else if (destination === '/app/call.invite') {
             const { conversationId } = body;
             if (conversationId && socket.userId) {
                const conv = await ConversationService.getConversationById(conversationId);
                if (conv) {
                   // Get current participants (caller may have already joined via call.join)
                   const currentParticipants = CallService.getParticipants(conversationId);

                   conv.memberIds.forEach(mId => {
                      if (mId.toString() !== socket.userId.toString()) {
                         broadcastToDestination(`/topic/calls/${mId}`, {
                            type: 'invite',
                            fromId: socket.userId,
                            callerName: body.callerName || "Nhóm",
                            callerAvatar: body.callerAvatar,
                            callType: body.callType || 'video',
                            conversationId: conversationId,
                            isGroup: !!conv.isGroup,
                            participants: currentParticipants
                         });
                      }
                   });

                   if (conv.isGroup) {
                      broadcastToDestination(`/topic/messages`, {
                         conversationId: conversationId,
                         senderId: socket.userId,
                         senderName: body.callerName || "Hệ thống",
                         content: `📞 CUỘC GỌI ${body.callType === 'video' ? 'VIDEO' : 'THOẠI'} ĐÃ BẮT ĐẦU`,
                         type: 'CALL_LOG',
                         createdAt: new Date().toISOString()
                      });
                   }
                }
             }
          } else if (destination === '/app/call.leave') {
             const { conversationId } = body;
             if (conversationId && socket.userId) {
                const conv = await ConversationService.getConversationById(conversationId);
                const isGroup = conv ? conv.isGroup : true;

                const callData = CallService.leaveCall(conversationId, socket.userId);
                if (callData) {
                   const forceEnd = !isGroup;

                   broadcastToDestination(`/topic/calls/group/${conversationId}`, {
                      type: forceEnd ? 'hangup' : 'left',
                      userId: socket.userId,
                      participants: forceEnd ? [] : callData.participants
                   });

                   if (callData.participants.length === 0 || forceEnd) {
                      if (forceEnd) {
                         callData.participants.forEach(pId => CallService.leaveCall(conversationId, pId));
                      }

                      const durationMs = new Date() - new Date(callData.startTime);
                      const minutes = Math.floor(durationMs / 60000);
                      const seconds = Math.floor((durationMs % 60000) / 1000);
                      const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                      
                      // ONLY send 'Call Ended' message for group chats
                      if (isGroup) {
                         const systemMsg = {
                            conversationId,
                            senderId: 'SYSTEM',
                            senderName: 'Hệ thống',
                            content: `Cuộc gọi đã kết thúc - ${durationStr}`,
                            type: 'CALL_END',
                            createdAt: new Date()
                         };
                         
                         try {
                            const savedMsg = await MessageService.saveMessage(systemMsg);
                            broadcastToDestination('/topic/messages', savedMsg);
                         } catch (err) { }
                      }
                   }
                }
                delete socket.activeCallConversationId;
             }
           } else if (destination === '/app/message.delivered') {
              const { messageId, conversationId } = body;
              if (messageId) {
                const updatedMsg = await MessageService.markAsDelivered(messageId);
                if (updatedMsg) {
                  broadcastToDestination('/topic/messages', {
                    type: 'STATUS_UPDATE',
                    messageId: messageId,
                    conversationId: conversationId || updatedMsg.conversationId,
                    status: 'DELIVERED',
                    updatedAt: new Date().toISOString()
                  });
                }
              }
           } else if (destination === '/app/message.seen') {
              const { conversationId } = body;
              if (conversationId && socket.userId) {
                await MessageService.markConversationAsSeen(conversationId, socket.userId);
                await ConversationService.resetUnreadCount(conversationId, socket.userId);
                
                broadcastToDestination('/topic/messages', {
                  type: 'STATUS_UPDATE',
                  conversationId: conversationId,
                  userId: socket.userId,
                  status: 'SEEN',
                  updatedAt: new Date().toISOString()
                });
              }
           }
        } else if (frame.command === 'DISCONNECT') {
          socket.close();
        }
      } catch (err) {
        console.error('Error processing STOMP frame:', err);
      }
    });

    socket.on('close', async () => {
      console.log(`WebSocket connection closed: ${socketId}`);
      if (socket.userId) {
        if (socket.activeCallConversationId) {
            const conversationId = socket.activeCallConversationId;
            const callData = CallService.leaveCall(conversationId, socket.userId);
            
            if (callData) {
                const conv = await ConversationService.getConversationById(conversationId);
                const isGroup = conv ? conv.isGroup : true;
                const forceEnd = !isGroup;

                broadcastToDestination(`/topic/calls/group/${conversationId}`, {
                    type: forceEnd ? 'hangup' : 'left',
                    userId: socket.userId,
                    participants: forceEnd ? [] : callData.participants
                });

                if (callData.participants.length === 0 || forceEnd) {
                    if (forceEnd) {
                        callData.participants.forEach(pId => CallService.leaveCall(conversationId, pId));
                    }

                    const durationMs = new Date() - new Date(callData.startTime);
                    const minutes = Math.floor(durationMs / 60000);
                    const seconds = Math.floor((durationMs % 60000) / 1000);
                    const durationStr = `${minutes.toString().padStart(2, '0')}:${seconds.toString().padStart(2, '0')}`;
                    
                    // ONLY send 'Call Ended' message for group chats
                    if (isGroup) {
                        const systemMsg = {
                            conversationId,
                            senderId: 'SYSTEM',
                            senderName: 'Hệ thống',
                            content: `Cuộc gọi đã kết thúc - ${durationStr}`,
                            type: 'CALL_END',
                            createdAt: new Date()
                        };
                        
                        try {
                            const savedMsg = await MessageService.saveMessage(systemMsg);
                            broadcastToDestination('/topic/messages', savedMsg);
                        } catch (err) { }
                    }
                }
            }
        }

        let stillConnected = false;
        for (const [id, s] of sockets) {
          if (s.userId === socket.userId && id !== socketId) {
            stillConnected = true;
            break;
          }
        }
        if (!stillConnected) {
          await PresenceService.setOffline(socket.userId, broadcastPresence);
        }
      }
      sockets.delete(socketId);
      subscriptions.delete(socketId);
    });
  });
};

const handleChatMessage = async (chatMessage) => {
  let { type, conversationId, senderId, senderName, senderAvatar, content, targetMessageId, emoji, replyToId, replyToContent } = chatMessage;

  // Real-time Content Moderation
  if (senderId !== 'SYSTEM' && (type === 'TEXT' || !type)) {
    const ModerationService = require('../services/ModerationService');
    const moderationResult = await ModerationService.checkMessage(senderId, content || '', module.exports);
    
    if (!moderationResult.allowed) {
      console.log(`[STOMP] Message from ${senderId} blocked by moderation: ${moderationResult.action}`);
      return; // Stop processing and don't broadcast/save
    }
  }

  // Augment missing sender info
  if (senderId !== 'SYSTEM' && (!senderName || !senderAvatar)) {
    try {
      const user = await prisma.user.findUnique({
        where: { id: senderId }
      });
      if (user) {
        senderName = senderName || user.fullName;
        senderAvatar = senderAvatar || user.avatarUrl;
        
        // Update the object for broadcasting
        chatMessage.senderName = senderName;
        chatMessage.senderAvatar = senderAvatar;
      }
    } catch (e) {
      console.error('Failed to augment sender info:', e);
    }
  }

  if (type === 'TYPING' || type === 'STOP_TYPING') {
    broadcastToDestination('/topic/messages', chatMessage);
    return;
  }

  if (type === 'REACTION') {
    const msg = await MessageService.getMessageById(targetMessageId);
    if (msg) {
      if (!msg.reactions) msg.reactions = new Map();
      msg.reactions.set(senderId, emoji);
      await msg.save();
      
      const reactionUpdate = msg.toJSON();
      if (!reactionUpdate.createdAt) reactionUpdate.createdAt = new Date().toISOString();
      reactionUpdate.targetMessageId = targetMessageId;
      broadcastToDestination('/topic/messages', reactionUpdate);
    }
    return;
  }

  if (type === 'RECALL') {
    const msg = await MessageService.getMessageById(targetMessageId);
    if (msg && msg.senderId === senderId) {
      msg.type = 'RECALL';
      msg.content = 'Tin nhắn đã bị thu hồi';
      await msg.save();
      
      const recallUpdate = msg.toJSON();
      if (!recallUpdate.createdAt) recallUpdate.createdAt = new Date().toISOString();
      // Ensure both id and targetMessageId are consistent strings
      recallUpdate.id = msg._id.toString();
      recallUpdate.targetMessageId = targetMessageId.toString();
      await ConversationService.updateLastMessage(msg.conversationId, msg.content, msg.type, msg.senderId);
      broadcastToDestination('/topic/messages', recallUpdate);
    }
    return;
  }

  const savedMsgModel = await MessageService.saveMessage({
    conversationId, senderId, senderName, senderAvatar, content,
    type: type || 'TEXT', replyToId, replyToContent,
    pollData: chatMessage.pollData
  });

  const savedMsg = savedMsgModel.toJSON();
  if (!savedMsg.createdAt) savedMsg.createdAt = new Date().toISOString();

  let previewContent = savedMsg.content;
  if (savedMsg.type === 'AUDIO') previewContent = '[Ghi âm]';
  else if (savedMsg.type === 'IMAGE') previewContent = '[Hình ảnh]';
  else if (savedMsg.type === 'VIDEO') previewContent = '[Video]';
  else if (savedMsg.type === 'FILE') previewContent = '[Tệp tin]';
  else if (savedMsg.type === 'RECALL') previewContent = 'Tin nhắn đã bị thu hồi';
  else if (savedMsg.type === 'POLL') previewContent = `[Bầu chọn] ${savedMsg.pollData?.question || ''}`;
  else if (savedMsg.type === 'STICKER') previewContent = '[Nhãn dán]';
  else if (savedMsg.type === 'CALL_END' || savedMsg.type === 'CALL_JOIN') previewContent = savedMsg.content;

  await ConversationService.updateLastMessage(conversationId, previewContent, savedMsg.type, savedMsg.senderId);
  
  if (chatMessage.clientTempId) {
    savedMsg.clientTempId = chatMessage.clientTempId;
  }
  
  broadcastToDestination('/topic/messages', savedMsg);
  // Xóa Redis cache để request tiếp theo lấy dữ liệu mới từ MongoDB
  await MessageService.invalidateMessageCache(conversationId);
};

const broadcastToDestination = (destination, body) => {
  let count = 0;
  sockets.forEach((socket, socketId) => {
    const userSubs = subscriptions.get(socketId);
    if (userSubs) {
      for (const [subId, dest] of userSubs.entries()) {
        const isMatch = dest === destination || 
                       (dest.endsWith('/*') && destination.startsWith(dest.slice(0, -1)));
        
        if (isMatch) {
          const frame = buildFrame('MESSAGE', {
            destination: destination,
            'content-type': 'application/json',
            'subscription': subId,
            'message-id': `msg-${Date.now()}-${count}`
          }, JSON.stringify(body));
          
          try {
            if (socket.readyState === 1) {
              socket.send(frame);
              count++;
            }
          } catch (e) {
            console.error(`Failed to send to socket ${socketId}:`, e.message);
          }
        }
      }
    }
  });

  if (destination.includes('call') || destination.includes('notification')) {
     console.log(`[STOMP] Broadcasted to ${count} socket(s) for ${destination}`);
  }
};

const forceLogoutAllSessions = (userId, reason = 'Bạn đã đăng xuất') => {
  sockets.forEach((s, sid) => {
    if (s.userId && s.userId.toString() === userId.toString()) {
      console.log(`Force logout global for user ${userId}: ${sid}`);
      try {
        s.send(buildFrame('ERROR', { message: 'SESSION_FORCE_LOGOUT' }, reason));
        setTimeout(() => s.close(), 100);
      } catch (err) {
        console.error(`Failed to send logout to socket ${sid}:`, err.message);
      }
    }
  });
};

module.exports = { setupStompSocket, broadcastToDestination, forceLogoutAllSessions };
