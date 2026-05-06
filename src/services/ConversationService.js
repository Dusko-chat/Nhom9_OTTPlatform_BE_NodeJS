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

  // Sort: Pinned first, then by lastMessageAt desc
  result.sort((a, b) => {
    const isPinnedA = a.pinnedBy && a.pinnedBy.includes(userId);
    const isPinnedB = b.pinnedBy && b.pinnedBy.includes(userId);

    if (isPinnedA && !isPinnedB) return -1;
    if (!isPinnedA && isPinnedB) return 1;

    const timeA = a.lastMessageAt ? new Date(a.lastMessageAt) : new Date(a.createdAt);
    const timeB = b.lastMessageAt ? new Date(b.lastMessageAt) : new Date(b.createdAt);
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

const updateAvatar = async (id, requesterId, avatarUrl) => {
  const conv = await Conversation.findById(id);
  if (conv) {
    // Check permission
    const isAdminOrDeputy = String(conv.adminId) === String(requesterId) || 
                           (conv.deputyIds && conv.deputyIds.includes(String(requesterId)));
    
    if (conv.isGroup && conv.permissions?.changeGroupInfo === 'ADMINS' && !isAdminOrDeputy) {
      return null; // Unauthorized
    }
    conv.avatarUrl = avatarUrl;
    await conv.save();
    return conv;
  }
  return null;
};

const updateName = async (id, requesterId, name) => {
  const conv = await Conversation.findById(id);
  if (conv) {
    // Check permission
    const isAdminOrDeputy = String(conv.adminId) === String(requesterId) || 
                           (conv.deputyIds && conv.deputyIds.includes(String(requesterId)));
    
    if (conv.isGroup && conv.permissions?.changeGroupInfo === 'ADMINS' && !isAdminOrDeputy) {
      return null; // Unauthorized
    }
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

const pinMessage = async (conversationId, requesterId, pinData) => {
  const conv = await Conversation.findById(conversationId);
  if (conv) {
    // Check permission
    const isAdminOrDeputy = String(conv.adminId) === String(requesterId) || 
                           (conv.deputyIds && conv.deputyIds.includes(String(requesterId)));
    
    if (conv.isGroup && conv.permissions?.pinMessages === 'ADMINS' && !isAdminOrDeputy) {
      return false; // Unauthorized
    }
    if (!conv.pinnedMessages) conv.pinnedMessages = [];
    
    const existingIndex = conv.pinnedMessages.findIndex(m => m.messageId === pinData.messageId);
    if (existingIndex !== -1) {
      // Unpin if exists
      conv.pinnedMessages.splice(existingIndex, 1);
    } else {
      // Pin if not exists
      conv.pinnedMessages.push(pinData);
    }
    await conv.save();
    return conv.pinnedMessages; // return the updated array so controller can broadcast it
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

const transferAdmin = async (conversationId, adminId, newAdminId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && String(conv.adminId) === String(adminId)) {
    if (conv.memberIds.includes(newAdminId)) {
      conv.adminId = newAdminId;
      // If new admin was a deputy, remove them from deputy list
      if (conv.deputyIds && conv.deputyIds.includes(newAdminId)) {
        conv.deputyIds = conv.deputyIds.filter(id => id !== newAdminId);
      }
      await conv.save();
      return true;
    }
  }
  return false;
};

const addDeputy = async (conversationId, adminId, deputyId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && String(conv.adminId) === String(adminId)) {
    if (conv.memberIds.includes(deputyId) && String(deputyId) !== String(adminId)) {
      if (!conv.deputyIds) conv.deputyIds = [];
      if (!conv.deputyIds.includes(deputyId)) {
        conv.deputyIds.push(deputyId);
        await conv.save();
        return true;
      }
    }
  }
  return false;
};

const removeDeputy = async (conversationId, adminId, deputyId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && String(conv.adminId) === String(adminId)) {
    if (conv.deputyIds && conv.deputyIds.includes(deputyId)) {
      conv.deputyIds = conv.deputyIds.filter(id => id !== deputyId);
      await conv.save();
      return true;
    }
  }
  return false;
};

const updatePermissions = async (conversationId, adminId, newPermissions) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && String(conv.adminId) === String(adminId)) {
    conv.permissions = { ...conv.permissions, ...newPermissions };
    await conv.save();
    return conv.permissions;
  }
  return null;
};

const togglePin = async (conversationId, userId) => {
  const conv = await Conversation.findById(conversationId);
  if (!conv) return false;
  
  if (!conv.pinnedBy) conv.pinnedBy = [];
  
  const index = conv.pinnedBy.indexOf(userId);
  if (index === -1) {
    conv.pinnedBy.push(userId);
  } else {
    conv.pinnedBy.splice(index, 1);
  }
  
  await conv.save();
  return conv.pinnedBy.includes(userId); // returns new status
};

const generateJoinLink = async (conversationId, requesterId) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && conv.memberIds.includes(requesterId)) {
    const isAdminOrDeputy = String(conv.adminId) === String(requesterId) || (conv.deputyIds && conv.deputyIds.includes(requesterId));
    
    // If link already exists and user is NOT admin/deputy, don't allow regeneration
    if (conv.joinLink && !isAdminOrDeputy) {
      return conv.joinLink; // Just return existing link
    }

    const crypto = require('crypto');
    const newLink = crypto.randomBytes(8).toString('hex');
    conv.joinLink = newLink;
    await conv.save();
    return newLink;
  }
  return null;
};

const toggleJoinApproval = async (conversationId, requesterId, isRequired) => {
  const conv = await Conversation.findById(conversationId);
  const isAdminOrDeputy = conv && (String(conv.adminId) === String(requesterId) || (conv.deputyIds && conv.deputyIds.includes(requesterId)));
  
  if (conv && conv.isGroup && isAdminOrDeputy) {
    conv.joinApprovalRequired = isRequired;
    await conv.save();
    return isRequired;
  }
  return null;
};

const joinByLink = async (link, userId) => {
  const conv = await Conversation.findOne({ joinLink: link });
  if (!conv || !conv.isGroup) return { success: false, message: 'Link không hợp lệ' };
  
  if (conv.memberIds.includes(userId)) return { success: false, message: 'Đã là thành viên' };

  if (conv.joinApprovalRequired) {
    if (!conv.pendingMembers) conv.pendingMembers = [];
    if (!conv.pendingMembers.includes(userId)) {
      conv.pendingMembers.push(userId);
      await conv.save();
    }
    return { success: true, pending: true, conversationId: conv._id, message: 'Đã gửi yêu cầu tham gia. Vui lòng chờ duyệt.' };
  } else {
    conv.memberIds.push(userId);
    await conv.save();
    return { success: true, pending: false, conversationId: conv._id, message: 'Đã tham gia nhóm thành công', conversation: conv };
  }
};

const approveMember = async (conversationId, adminId, targetUserId, isApproved) => {
  const conv = await Conversation.findById(conversationId);
  if (conv && conv.isGroup && String(conv.adminId) === String(adminId)) {
    if (conv.pendingMembers && conv.pendingMembers.includes(targetUserId)) {
      conv.pendingMembers = conv.pendingMembers.filter(id => id !== targetUserId);
      if (isApproved) {
        if (!conv.memberIds.includes(targetUserId)) {
          conv.memberIds.push(targetUserId);
        }
      }
      await conv.save();
      return true;
    }
  }
  return false;
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
  transferAdmin,
  togglePin,
  addDeputy,
  removeDeputy,
  updatePermissions,
  generateJoinLink,
  toggleJoinApproval,
  joinByLink,
  approveMember,
};
