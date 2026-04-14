const express = require('express');
const router = express.Router();
const { getStatus, getBulkStatus } = require('../controllers/StatusController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:userId', protect, getStatus);
router.post('/bulk', protect, getBulkStatus);

module.exports = router;
