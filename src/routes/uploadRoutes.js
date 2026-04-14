const express = require('express');
const router = express.Router();
const multer = require('multer');
const { uploadMedia } = require('../controllers/UploadController');
const { protect } = require('../middleware/authMiddleware');

const storage = multer.memoryStorage();
const upload = multer({ storage });

router.post('/', protect, upload.single('file'), uploadMedia);

module.exports = router;
