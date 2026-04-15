const express = require('express');
const router = express.Router();
const attendanceController = require('../controllers/AttendanceController');
const officeController = require('../controllers/OfficeController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.use(protect);

// User & Admin routes
router.post('/check-in', attendanceController.checkIn);
router.get('/history', attendanceController.getHistory);
router.get('/offices', officeController.getOffices);

// Admin & Manager routes
router.get('/all', restrictTo('ADMIN', 'MANAGER', 'SUPER_ADMIN'), attendanceController.getAllHistory);
router.get('/export/:userId', restrictTo('ADMIN', 'MANAGER', 'SUPER_ADMIN'), attendanceController.exportAttendanceToExcel);
router.post('/export-bulk', restrictTo('ADMIN', 'MANAGER', 'SUPER_ADMIN'), attendanceController.exportBulkAttendance);

// Admin only routes for Office settings
router.post('/offices', restrictTo('ADMIN', 'SUPER_ADMIN'), officeController.createOffice);
router.put('/offices/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), officeController.updateOffice);
router.delete('/offices/:id', restrictTo('ADMIN', 'SUPER_ADMIN'), officeController.deleteOffice);

module.exports = router;
