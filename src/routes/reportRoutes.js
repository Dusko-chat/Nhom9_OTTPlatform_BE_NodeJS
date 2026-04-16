const express = require('express');
const router = express.Router();
const reportController = require('../controllers/reportController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.post('/', protect, reportController.createReport);
router.get('/', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), reportController.getAllReports);
router.put('/:id/status', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), reportController.updateReportStatus);

module.exports = router;
