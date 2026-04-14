const express = require('express');
const router = express.Router();
const {
  getFriends,
  sendRequest,
  getPending,
  acceptRequest,
  unfriend,
} = require('../controllers/FriendController');
const { protect } = require('../middleware/authMiddleware');

router.get('/', protect, getFriends);
router.post('/request', protect, sendRequest);
router.get('/pending/:userId', protect, getPending);
router.post('/accept/:requestId', protect, acceptRequest);
router.post('/unfriend', protect, unfriend);

module.exports = router;
