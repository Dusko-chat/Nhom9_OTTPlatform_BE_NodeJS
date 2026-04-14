const express = require('express');
const router = express.Router();
const {
  getUser,
  updateProfile,
  changePassword,
  getUsersByIds,
  searchUser,
  getAllUsers,
  updatePushToken,
  lockUser,
  unlockUser,
  deleteUser,
  deleteMe,
  updateUserRole,
} = require('../controllers/UserController');

const { protect, restrictTo } = require('../middleware/authMiddleware');

router.get('/all', protect, getAllUsers);
router.get('/search', protect, searchUser);
router.get('/:id', protect, getUser);
router.put('/:id', protect, updateProfile);
router.put('/:id/change-password', protect, changePassword);
router.post('/list', protect, getUsersByIds);
router.post('/:id/push-token', protect, updatePushToken);

// Admin only routes
router.put('/:id/lock', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), lockUser);
router.put('/:id/unlock', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), unlockUser);
router.put('/:id/role', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), updateUserRole);
router.delete('/:id', protect, restrictTo('ADMIN', 'SUPER_ADMIN'), deleteUser);

// Self service
router.delete('/me/delete', protect, deleteMe);



module.exports = router;
