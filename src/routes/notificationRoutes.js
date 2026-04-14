const express = require('express');
const router = express.Router();
const { getNotifications, readAll } = require('../controllers/NotificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:userId', protect, getNotifications);
router.post('/read-all/:userId', protect, readAll);

module.exports = router;
