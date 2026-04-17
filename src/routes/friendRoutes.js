const express = require('express');
const router = express.Router();
const {
  getFriends,
  sendRequest,
  getPending,
  acceptRequest,
  rejectRequest,
  cancelRequest,
  unfriend,
} = require('../controllers/FriendController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getFriends);
router.post('/request', protect, sendRequest);
router.post('/cancel', protect, cancelRequest);
router.get('/pending/:userId', protect, getPending);
router.post('/accept/:requestId', protect, acceptRequest);
router.post('/reject/:requestId', protect, rejectRequest);
router.post('/unfriend', protect, unfriend);

module.exports = router;
