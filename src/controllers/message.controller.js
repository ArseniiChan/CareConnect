const ChatService = require('../services/chat.service');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

/**
 * Message controller — replaces the old conversation controller.
 *
 * KEY CHANGE: Messages are per-appointment, not per-conversation.
 * Instead of GET /conversations/:id/messages, it's GET /appointments/:id/messages.
 * The appointment IS the conversation.
 */

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const listChats = catchAsync(async (req, res) => {
  const chats = await ChatService.listChats(req.user.id, req.user.role);
  res.json({ status: 200, data: chats });
});

const getMessages = catchAsync(async (req, res) => {
  const appointmentId = req.params.id;
  if (!appointmentId || !UUID_REGEX.test(appointmentId)) {
    throw ApiError.badRequest('Invalid appointment ID');
  }

  const { page, limit } = req.query;
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const result = await ChatService.getMessages(appointmentId, req.user.id, {
    page: parseInt(page, 10) || 1,
    limit: parsedLimit,
  });
  res.json({ status: 200, ...result });
});

const sendMessage = catchAsync(async (req, res) => {
  const appointmentId = req.params.id;
  if (!appointmentId || !UUID_REGEX.test(appointmentId)) {
    throw ApiError.badRequest('Invalid appointment ID');
  }

  const message = await ChatService.sendMessage(
    appointmentId, req.user.id, req.body.content
  );
  res.status(201).json({ status: 201, data: message });
});

module.exports = { listChats, getMessages, sendMessage };
