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
    const { userId } = req.params;
    await Notification.updateMany({ userId }, { read: true });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const deleteNotification = async (req, res) => {
  try {
    const { id } = req.params;
    await Notification.findByIdAndDelete(id);
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const clearAll = async (req, res) => {
  try {
    const { userId } = req.params;
    await Notification.deleteMany({ userId });
    res.json({ success: true });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { getNotifications, readAll, deleteNotification, clearAll };
