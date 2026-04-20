const express = require('express');
const router = express.Router();
const {
  createGroup,
  startDirect,
  getUserConversations,
  pinMessage,
  addMember,
  leaveGroup,
  updateAvatar,
  updateName,
  markAsRead,
  toggleMute,
  deleteConversation,
  disbandGroup,
  transferAdmin,
  togglePin,
  summarizeConversation,
} = require('../controllers/ConversationController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getUserConversations);
router.post('/group', protect, createGroup);
router.post('/direct', protect, startDirect);
router.post('/:id/pin', protect, pinMessage);
router.post('/:id/add-member', protect, addMember);
router.post('/:id/leave', protect, leaveGroup);
router.put('/:id/avatar', protect, updateAvatar);
router.put('/:id/name', protect, updateName);
router.post('/:id/reset-unread', protect, markAsRead);
router.post('/:id/toggle-mute', protect, toggleMute);
router.post('/:id/toggle-pin', protect, togglePin);
router.post('/:id/disband', protect, disbandGroup);
router.post('/:id/transfer-admin', protect, transferAdmin);
router.delete('/:id', protect, deleteConversation);
router.post('/:id/summarize', protect, summarizeConversation);

module.exports = router;
