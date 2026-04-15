const express = require('express');
const router = express.Router();
const statsController = require('../controllers/statsController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.get('/overview', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), statsController.getOverviewStats);
router.post('/announce', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), statsController.sendAnnouncement);

module.exports = router;
