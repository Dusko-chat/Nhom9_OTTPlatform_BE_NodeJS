const express = require('express');
const router = express.Router();
const departmentController = require('../controllers/departmentController');
const { protect, restrictTo } = require('../middleware/authMiddleware');

router.get('/', departmentController.getAllDepartments);

// Only ADMIN or SUPER_ADMIN can modify departments
router.post('/', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), departmentController.createDepartment);
router.post('/:deptId/assign-user', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), departmentController.assignUser);
router.delete('/:id', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), departmentController.deleteDepartment);


module.exports = router;
