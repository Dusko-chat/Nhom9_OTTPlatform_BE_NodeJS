const FriendService = require('../services/FriendService');
const { broadcastToDestination } = require('../sockets/stompHandler');
const Notification = require('../models/Notification');

const getFriends = async (req, res) => {
  try {
    const { userId } = req.query;
    const friends = await FriendService.getFriends(userId);
    res.json({ success: true, data: friends });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const sendRequest = async (req, res) => {
  try {
    const { senderId, receiverId } = req.query;
    const fr = await FriendService.sendRequest(senderId, receiverId);
    if (fr) {
      // Broadcast real-time notification to receiver
      const latestNoti = await Notification.findOne({ userId: receiverId }).sort({ createdAt: -1 });
      if (latestNoti) {
        broadcastToDestination(`/topic/notifications/${receiverId}`, latestNoti);
      }
    }
    res.json({ success: true, data: 'Sent' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getPending = async (req, res) => {
  try {
    const { userId } = req.params;
    const pending = await FriendService.getPendingRequests(userId);
    res.json({ success: true, data: pending });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const acceptRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const fr = await FriendService.acceptRequest(requestId);
    if (fr) {
      // Broadcast real-time notification to the person who sent the request
      const latestNoti = await Notification.findOne({ userId: fr.senderId }).sort({ createdAt: -1 });
      if (latestNoti) {
        broadcastToDestination(`/topic/notifications/${fr.senderId}`, latestNoti);
      }
    }
    res.json({ success: true, data: 'Accepted' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const unfriend = async (req, res) => {
  try {
    const { userId, friendId } = req.query;
    await FriendService.unfriend(userId, friendId);
    
    // Broadcast silent update to the friend someone unfriended them
    broadcastToDestination(`/topic/notifications/${friendId}`, {
      type: 'FRIEND_REMOVE',
      silent: true,
      relatedId: userId
    });
    // And also to myself
    broadcastToDestination(`/topic/notifications/${userId}`, {
      type: 'FRIEND_REMOVE',
      silent: true,
      relatedId: friendId
    });

    res.json({ success: true, data: 'Unfriended' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const cancelRequest = async (req, res) => {
  try {
    const { senderId, receiverId } = req.query;
    await FriendService.cancelRequest(senderId, receiverId);

    // Broadcast silent update to receiver to remove the request from their pending list
    broadcastToDestination(`/topic/notifications/${receiverId}`, {
      type: 'FRIEND_CANCEL',
      silent: true,
      relatedId: senderId
    });

    res.json({ success: true, data: 'Cancelled' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const rejectRequest = async (req, res) => {
  try {
    const { requestId } = req.params;
    const FriendRequest = require('../models/FriendRequest');
    const fr = await FriendRequest.findById(requestId);
    if (fr) {
        await FriendService.rejectRequest(requestId);
        
        // Notify the person who sent the request
        broadcastToDestination(`/topic/notifications/${fr.senderId}`, {
            type: 'FRIEND_REJECT',
            silent: true,
            relatedId: fr.receiverId
        });
    }
    
    res.json({ success: true, data: 'Rejected' });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = {
  getFriends,
  sendRequest,
  getPending,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  unfriend,
};
