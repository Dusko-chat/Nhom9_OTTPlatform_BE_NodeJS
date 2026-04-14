const Notification = require('../models/Notification');

const getNotifications = async (req, res) => {
  try {
    const list = await Notification.find({ userId: req.params.userId }).sort({ createdAt: -1 });
    res.json({ success: true, data: list });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const readAll = async (req, res) => {
  try {
    await Notification.updateMany({ userId: req.params.userId }, { read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { getNotifications, readAll };
