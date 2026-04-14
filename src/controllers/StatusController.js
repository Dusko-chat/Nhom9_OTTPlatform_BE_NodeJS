const PresenceService = require('../services/PresenceService');

const getStatus = async (req, res) => {
  try {
    const status = await PresenceService.getUserStatus(req.params.userId);
    res.json({ success: true, data: status });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

const getBulkStatus = async (req, res) => {
  try {
    const userIds = req.body;
    const statuses = {};
    for (let id of userIds) {
      statuses[id] = await PresenceService.getUserStatus(id);
    }
    res.json({ success: true, data: statuses });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { getStatus, getBulkStatus };
