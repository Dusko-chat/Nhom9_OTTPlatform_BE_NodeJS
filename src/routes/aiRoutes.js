const express = require('express');
const router = express.Router();
const { askAI, uploadMiddleware } = require('../controllers/AIController');

router.post('/ask', uploadMiddleware, askAI);

module.exports = router;
