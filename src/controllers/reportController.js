const Report = require('../models/Report');
const prisma = require('../config/prisma');
const { broadcastToDestination } = require('../sockets/stompHandler');

exports.createReport = async (req, res) => {
  try {
    const { title, description, type } = req.body;
    const userId = req.user.id;

    const report = new Report({
      userId,
      title,
      description,
      type: type || 'BUG',
      status: 'PENDING'
    });

    await report.save();

    // Broadcast realtime event to admins
    try {
      broadcastToDestination('/topic/admin/reports', {
        ...report.toObject(),
        eventType: 'NEW_REPORT'
      });
    } catch (e) {
      console.error("Failed to broadcast new report", e);
    }

    res.status(201).json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getAllReports = async (req, res) => {
  try {
    const reports = await Report.find().sort({ createdAt: -1 });
    
    // Fetch user details for each report quickly
    const userIds = [...new Set(reports.map(r => r.userId))];
    const users = await prisma.user.findMany({
      where: { id: { in: userIds } },
      select: { id: true, fullName: true, email: true, avatarUrl: true }
    });
    
    const userMap = {};
    users.forEach(u => { userMap[u.id] = u; });

    const formattedReports = reports.map(r => ({
      ...r.toObject(),
      user: userMap[r.userId] || { fullName: 'Unknown', email: '' }
    }));

    res.json({ success: true, data: formattedReports });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateReportStatus = async (req, res) => {
  try {
    const { id } = req.params;
    const { status, adminReply } = req.body; 
    
    const report = await Report.findById(id);
    if (!report) return res.status(404).json({ success: false, message: 'Report not found' });

    report.status = status;
    if (adminReply) report.adminReply = adminReply;
    if (status === 'RESOLVED') report.resolvedAt = new Date();
    
    await report.save();

    // Send a Notification to the user
    // Since we don't have Notification model directly imported, we'll try to require it
    try {
      const Notification = require('../models/Notification');
      const notifParams = {
        userId: report.userId,
        type: 'SYSTEM',
        title: 'Báo cáo của bạn đã được Admin phản hồi',
        content: adminReply || 'Báo cáo của bạn đã được ghi nhận và xử lý thành công!',
        relatedId: report._id.toString()
      };
      const notif = await Notification.create(notifParams);
      // Optional: Broadcast notification via STOMP if there's a topic, eg: /topic/notifications/{userId}
      broadcastToDestination(`/topic/notifications/${report.userId}`, notif);
    } catch (notifErr) {
      console.error("Failed to send notification:", notifErr);
    }

    // Broadcast realtime update to admins
    try {
      broadcastToDestination('/topic/admin/reports', {
        ...report.toObject(),
        eventType: 'STATUS_UPDATE'
      });
    } catch (e) {
      console.error("Failed to broadcast report update", e);
    }

    res.json({ success: true, data: report });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
