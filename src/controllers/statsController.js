const prisma = require('../config/prisma');
const Message = require('../models/Message');
const Notification = require('../models/Notification');
const PresenceService = require('../services/PresenceService');
const { broadcastToDestination } = require('../sockets/stompHandler');

exports.getOverviewStats = async (req, res) => {
  try {
    const totalUsers = await prisma.user.count();
    const totalMessages = await Message.countDocuments();
    const lockedUsers = await prisma.user.count({ where: { isLocked: true } });

    const startOfToday = new Date();
    startOfToday.setHours(0, 0, 0, 0);
    const newUsersToday = await prisma.user.count({
      where: { createdAt: { gte: startOfToday } }
    });

    const activeUsers = await PresenceService.getActiveUserCount();

    // Lấy số lượng tin nhắn theo ngày trong 7 ngày gần nhất
    const SevenDaysAgo = new Date();
    SevenDaysAgo.setDate(SevenDaysAgo.getDate() - 7);

    const perDay = await Message.aggregate([
      {
        $match: {
          createdAt: { $gte: SevenDaysAgo }
        }
      },
      {
        $group: {
          _id: {
            day: { $dayOfMonth: "$createdAt" },
            month: { $month: "$createdAt" },
            year: { $year: "$createdAt" }
          },
          count: { $sum: 1 }
        }
      },
      {
        $sort: { "_id.year": -1, "_id.month": -1, "_id.day": -1 }
      }
    ]);

    res.json({
      success: true,
      data: {
        totalUsers,
        totalMessages,
        lockedUsers,
        newUsersToday,
        activeUsers,
        perDay
      }
    });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.sendAnnouncement = async (req, res) => {
  try {
    const { content } = req.body;
    if (!content) return res.status(400).json({ success: false, message: 'Nội dung thông báo không được để trống' });

    // 1. Create a System Message for Chat
    const announcement = {
      id: `system-${Date.now()}`,
      senderId: 'SYSTEM',
      senderName: 'Thông báo hệ thống',
      content,
      type: 'SYSTEM_ANNOUNCEMENT',
      createdAt: new Date().toISOString()
    };

    // Broadcast to all connected users for Chat UI
    broadcastToDestination('/topic/messages', announcement);

    // 2. Create Persistent Notifications for ALL users
    const allUsers = await prisma.user.findMany({ select: { id: true } });
    const notificationData = allUsers.map(user => ({
      userId: user.id,
      type: 'SYSTEM',
      title: 'Thông báo hệ thống',
      content: content,
      read: false
    }));

    await Notification.insertMany(notificationData);

    // 3. Optional: Broadcast to individual notification topics for real-time alert counts
    allUsers.forEach(user => {
      broadcastToDestination(`/topic/notifications/${user.id}`, {
        type: 'NEW_NOTIFICATION',
        title: 'Thông báo hệ thống',
        content: content
      });
    });

    res.json({ success: true, message: 'Thông báo đã được gửi thành công và lưu vào danh sách thông báo' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
