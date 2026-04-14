const FriendRequest = require('../models/FriendRequest');
const User = require('../models/User');
const Notification = require('../models/Notification');

const sendRequest = async (senderId, receiverId) => {
  const existing = await FriendRequest.findOne({
    $or: [
      { senderId, receiverId },
      { senderId: receiverId, receiverId: senderId },
    ],
  });

  if (existing) return null;

  const sender = await User.findById(senderId);
  const fr = await FriendRequest.create({
    senderId,
    receiverId,
    status: 'PENDING',
    senderName: sender?.fullName,
    senderAvatar: sender?.avatarUrl,
  });

  // Create Notification in DB
  await Notification.create({
    userId: receiverId,
    type: 'FRIEND_REQUEST',
    title: 'Lời mời kết bạn mới',
    content: `${sender?.fullName || 'Ai đó'} đã gửi cho bạn một lời mời kết bạn.`,
    relatedId: senderId,
  });

  return fr;
};

const getPendingRequests = async (userId) => {
  return await FriendRequest.find({ receiverId: userId, status: 'PENDING' });
};

const acceptRequest = async (requestId) => {
  const fr = await FriendRequest.findById(requestId);
  if (fr && fr.status === 'PENDING') {
    fr.status = 'ACCEPTED';
    await fr.save();

    // Create Notification for the sender
    const receiver = await User.findById(fr.receiverId);
    await Notification.create({
      userId: fr.senderId,
      type: 'SYSTEM',
      title: 'Chấp nhận kết bạn',
      content: `${receiver?.fullName || 'Ai đó'} đã chấp nhận lời mời kết bạn của bạn.`,
      relatedId: fr.receiverId,
    });

    return fr;
  }
  return null;
};

const getFriends = async (userId) => {
  const requests = await FriendRequest.find({
    $or: [
      { senderId: userId, status: 'ACCEPTED' },
      { receiverId: userId, status: 'ACCEPTED' },
    ],
  });

  const friendIds = requests.map((fr) =>
    fr.senderId === userId ? fr.receiverId : fr.senderId
  );

  const friends = await User.find({ _id: { $in: friendIds } }).select('-password');
  return friends;
};

const unfriend = async (userId, friendId) => {
  await FriendRequest.deleteOne({
    $or: [
      { senderId: userId, receiverId: friendId, status: 'ACCEPTED' },
      { senderId: friendId, receiverId: userId, status: 'ACCEPTED' },
    ],
  });
};

module.exports = {
  sendRequest,
  getPendingRequests,
  acceptRequest,
  getFriends,
  unfriend,
};
