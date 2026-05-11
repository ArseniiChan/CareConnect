const { Router } = require('express');
const rateLimit = require('express-rate-limit');
const { chat } = require('../controllers/chat.controller');

const router = Router();

const chatLimiter = rateLimit({
  windowMs: 60 * 1000,
  max: 20,
  message: { status: 429, message: 'Too many chat requests, slow down a moment.' },
  standardHeaders: true,
  legacyHeaders: false,
});

router.post('/', chatLimiter, chat);

module.exports = router;
