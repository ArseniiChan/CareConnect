const { Router } = require('express');
const messageController = require('../controllers/message.controller');
const authenticate = require('../middleware/auth');

const router = Router();

/**
 * Message routes — replaces the old conversation routes.
 *
 * GET /messages/chats — list all appointment chats the user is part of
 *
 * Messages for a specific appointment are accessed via:
 *   GET  /appointments/:id/messages
 *   POST /appointments/:id/messages
 * (defined in appointment.routes.js)
 */

router.get('/chats', authenticate, messageController.listChats);

module.exports = router;
