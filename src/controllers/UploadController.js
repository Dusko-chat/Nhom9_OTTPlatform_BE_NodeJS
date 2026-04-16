const S3Service = require('../services/S3Service');

const uploadMedia = async (req, res) => {
  try {
    if (!req.file) {
      return res.status(400).json({ success: false, message: 'No file uploaded' });
    }
    const url = await S3Service.uploadFile(req.file);
    res.json({ success: true, data: url });
  } catch (error) {
    res.json({ success: false, message: error.message });
  }
};

const requestPresignedUrl = async (req, res) => {
  try {
    const { fileName, fileType } = req.body;
    if (!fileName || !fileType) {
      return res.status(400).json({ success: false, message: 'fileName and fileType are required' });
    }
    
    const result = await S3Service.getPresignedUrl(fileName, fileType);
    res.json({ success: true, data: result });
  } catch (error) {
    res.status(400).json({ success: false, message: error.message });
  }
};

module.exports = { uploadMedia, requestPresignedUrl };
