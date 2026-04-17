const Conversation = require('../models/Conversation');
const prisma = require('../config/prisma');

const createGroup = async (name, adminId, memberIds) => {
  if (!memberIds.includes(adminId)) {
    memberIds.push(adminId);
  }
  const conv = await Conversation.create({
    isGroup: true,
    name,
    adminId,
    memberIds,
  });
  return conv;
};

const startDirectConversation = async (user1Id, user2Id) => {
  let conv = await Conversation.findOne({
    isGroup: false,
    memberIds: { $all: [user1Id, user2Id], $size: 2 },
  });

  if (!conv) {
    conv = await Conversation.create({
      isGroup: false,
      memberIds: [user1Id, user2Id],
    });
  }

  // Add virtual fields for frontend
  const otherUser = await prisma.user.findUnique({
    where: { id: user2Id }
  });
  
  if (otherUser) {
    const convObj = conv.toObject();
    convObj.name = otherUser.fullName;
    convObj.avatarUrl = otherUser.avatarUrl;
    return convObj;
  }

  return conv;
};

const getUserConversations = async (userId) => {
  const convs = await Conversation.find({ memberIds: userId });
  
  // 1. Collect other user IDs for batch fetching
  const otherUserIds = new Set();
  convs.forEach(conv => {
    if (!conv.isGroup) {
      const otherId = conv.memberIds.find(id => id !== userId);
      if (otherId) otherUserIds.add(otherId);
    }
  });

  // 2. Batch fetch user data from PostgreSQL
  const users = await prisma.user.findMany({
    where: { id: { in: Array.from(otherUserIds) } },
    select: { id: true, fullName: true, avatarUrl: true }
  });
  
  const userMap = users.reduce((acc, u) => {
    acc[u.id] = u;
    return acc;
  }, {});

  const result = [];

  for (let conv of convs) {
    let convObj = conv.toObject();
    if (!conv.isGroup) {
      const otherId = conv.memberIds.find((id) => id !== userId);
      const otherUser = userMap[otherId];
      if (otherUser) {
        convObj.name = otherUser.fullName;
        convObj.avatarUrl = otherUser.avatarUrl;
      }
    }
    
    // Convert Map to plain Object and filter deleted
    if (convObj.unreadCounts && typeof convObj.unreadCounts.toJSON === 'function') {
        convObj.unreadCounts = convObj.unreadCounts.toJSON();
    } else if (convObj.unreadCounts instanceof Map) {
        convObj.unreadCounts = Object.fromEntries(convObj.unreadCounts);
    }
    
    // Filter if deleted for this user
    const deleteAt = conv.deletedHistoryAt ? conv.deletedHistoryAt.get(userId) : null;
    if (deleteAt) {
        const lastMsgTime = conv.lastMessageAt ? new Date(conv.lastMessageAt) : new Date(conv.createdAt);
        if (lastMsgTime <= new Date(deleteAt)) {
             continue; // Hide conversation from list
        }
    }

    result.push(convObj);
  }

  // Sort by lastMessageAt desc
  result.sort((a, b) => {
    const timeA = a.lastMessageAt ? new Date(a.lastMessageAt) : new Date(0);
    const timeB = b.lastMessageAt ? new Date(b.lastMessageAt) : new Date(0);
    return timeB - timeA;
  });

  return result;
};

const updateLastMessage = async (conversationId, content, type, senderId) => {
  const conv = await Conversation.findById(conversationId);
  if (!conv) return;

  let preview = content;
  if (type === 'IMAGE') preview = '[Hình ảnh]';
  else if (type === 'VIDEO') preview = '[Video]';
  else if (type === 'FILE') preview = '[Tệp tin]';
  else if (type === 'RECALL') preview = 'Tin nhắn đã bị thu hồi';

  conv.lastMessage = preview;
  conv.lastMessageAt = new Date();

  if (conv.memberIds) {
    conv.memberIds.forEach((mid) => {
      if (mid !== senderId) {
        const current = conv.unreadCounts.get(mid) || 0;
        conv.unreadCounts.set(mid, current + 1);
      }
    });
  }

  await conv.save();
};

const resetUnreadCount = async (conversationId, userId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv) {
    conv.unreadCounts.set(userId, 0);
    await conv.save();
  }
};

const updateAvatar = async (id, avatarUrl) => {
  const conv = await Conversation.findById(id);
  if (conv) {
    conv.avatarUrl = avatarUrl;
    await conv.save();
    return conv;
  }
  return null;
};

const updateName = async (id, name) => {
  const conv = await Conversation.findById(id);
  if (conv) {
    conv.name = name;
    await conv.save();
    return conv;
  }
  return null;
};

const leaveGroup = async (conversationId, userId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && conv.memberIds.includes(userId)) {
    conv.memberIds = conv.memberIds.filter((id) => id !== userId);
    if (userId === conv.adminId && conv.memberIds.length > 0) {
      conv.adminId = conv.memberIds[0];
    }
    await conv.save();
    return true;
  }
  return false;
};

const addMember = async (conversationId, userId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && !conv.memberIds.includes(userId)) {
    conv.memberIds.push(userId);
    await conv.save();
    return true;
  }
  return false;
};

const pinMessage = async (conversationId, messageContent) => {
  const conv = await Conversation.findById(conversationId);
  if (conv) {
    conv.pinnedMessage = messageContent;
    await conv.save();
    return true;
  }
  return false;
};

const toggleMute = async (conversationId, userId) => {
  const conv = await Conversation.findById(conversationId);
  if (!conv) return false;
  
  if (!conv.mutedUserIds) conv.mutedUserIds = [];
  
  const index = conv.mutedUserIds.indexOf(userId);
  if (index === -1) {
    conv.mutedUserIds.push(userId);
  } else {
    conv.mutedUserIds.splice(index, 1);
  }
  
  await conv.save();
  return conv.mutedUserIds.includes(userId); // returns new status
};

const disbandGroup = async (conversationId, adminId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && String(conv.adminId) === String(adminId)) {
    // Keep members list to broadcast before deletion
    const members = [...conv.memberIds];
    await Conversation.findByIdAndDelete(conversationId);
    return { success: true, members };
  }
  return { success: false, message: 'Chỉ trưởng nhóm mới có quyền giải tán nhóm' };
};

const deleteConversation = async (conversationId, userId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv) {
    if (!conv.deletedHistoryAt) conv.deletedHistoryAt = new Map();
    conv.deletedHistoryAt.set(userId, new Date());
    await conv.save();
    return true;
  }
  return false;
};

const getConversationById = async (id) => {
  return await Conversation.findById(id);
};

module.exports = {
  createGroup,
  startDirectConversation,
  getUserConversations,
  updateLastMessage,
  resetUnreadCount,
  updateAvatar,
  updateName,
  leaveGroup,
  addMember,
  pinMessage,
  toggleMute,
  getConversationById,
  deleteConversation,
  disbandGroup,
};
