const express = require('express');
const router = express.Router();
const { getNotifications, readAll, deleteNotification, clearAll } = require('../controllers/NotificationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:userId', protect, getNotifications);
router.post('/read-all/:userId', protect, readAll);
router.delete('/:id', protect, deleteNotification);
router.delete('/all/:userId', protect, clearAll);

module.exports = router;
