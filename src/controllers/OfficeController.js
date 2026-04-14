const Office = require('../models/Office');

exports.createOffice = async (req, res) => {
  try {
    const office = new Office(req.body);
    await office.save();
    res.status(201).json({ success: true, data: office });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.getOffices = async (req, res) => {
  try {
    const offices = await Office.find({ isActive: true });
    res.json({ success: true, data: offices });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.updateOffice = async (req, res) => {
  try {
    const office = await Office.findByIdAndUpdate(req.params.id, req.body, { new: true });
    res.json({ success: true, data: office });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};

exports.deleteOffice = async (req, res) => {
  try {
    await Office.findByIdAndUpdate(req.params.id, { isActive: false });
    res.json({ success: true, message: 'Đã xóa văn phòng thành công' });
  } catch (error) {
    res.status(500).json({ success: false, message: error.message });
  }
};
