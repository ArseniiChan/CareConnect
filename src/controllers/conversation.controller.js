const ChatService = require('../services/chat.service');
const catchAsync = require('../utils/catchAsync');

const list = catchAsync(async (req, res) => {
  const conversations = await ChatService.listConversations(req.user.id);
  res.json({ status: 200, data: conversations });
});

const getMessages = catchAsync(async (req, res) => {
  const { page, limit } = req.query;
  // SECURITY FIX: No max cap on limit. An attacker could send ?limit=999999
  // and dump the entire conversation history in one request, causing:
  // 1. Memory exhaustion on the server (loading 1M messages into a JSON array)
  // 2. Denial of service from the resulting DB query
  // Fix: Cap at 100 messages per page.
  const parsedLimit = Math.min(100, Math.max(1, parseInt(limit, 10) || 50));
  const result = await ChatService.getMessages(req.params.id, req.user.id, {
    page: parseInt(page, 10) || 1,
    limit: parsedLimit,
  });
  res.json({ status: 200, ...result });
});

const sendMessage = catchAsync(async (req, res) => {
  const message = await ChatService.sendMessage(
    req.params.id, req.user.id, req.body.content, req.body.type
  );
  res.status(201).json({ status: 201, data: message });
});

module.exports = { list, getMessages, sendMessage };
