const express = require('express');
const router = express.Router();
const { getMessages, clearHistory, votePoll, getPollDetails, closePoll, editMessage } = require('../controllers/ChatController');
const { protect } = require('../middleware/authMiddleware');

router.get('/:conversationId', protect, getMessages);
router.delete('/:conversationId', protect, clearHistory);
router.post('/:messageId/vote', protect, votePoll);
router.get('/:messageId/poll-details', protect, getPollDetails);
router.post('/:messageId/close-poll', protect, closePoll);
router.put('/:messageId', protect, editMessage);

module.exports = router;
