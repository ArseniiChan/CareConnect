const GeminiService = require('../services/gemini.service');
const ApiError = require('../utils/ApiError');
const catchAsync = require('../utils/catchAsync');

const MAX_HISTORY = 20;

const chat = catchAsync(async (req, res) => {
  const { messages } = req.body || {};

  if (!Array.isArray(messages) || messages.length === 0) {
    throw ApiError.badRequest('Request body must include a non-empty "messages" array.');
  }

  const trimmed = messages
    .slice(-MAX_HISTORY)
    .filter((m) => m && typeof m.content === 'string' && m.content.trim().length > 0)
    .map((m) => ({
      role: m.role === 'assistant' ? 'assistant' : 'user',
      content: m.content.trim(),
    }));

  if (trimmed.length === 0) {
    throw ApiError.badRequest('No valid messages provided.');
  }

  const reply = await GeminiService.generateReply(trimmed);
  res.json({ status: 200, data: { reply } });
});

module.exports = { chat };
