const ChatService = require('../services/chat.service');
const ConversationModel = require('../models/conversation.model');

function chatHandler(io, socket) {
  // SECURITY FIX: The old code let any authenticated user join ANY conversation
  // room by sending { conversationId: 999 }. They'd then receive all new_message
  // events for that conversation — eavesdropping on private medical conversations.
  //
  // Fix: Check that the user is actually a participant before joining the room.
  socket.on('join_conversation', async ({ conversationId }) => {
    try {
      const isParticipant = await ConversationModel.isParticipant(conversationId, socket.userId);
      if (!isParticipant) {
        return socket.emit('error', { message: 'You are not a participant in this conversation' });
      }
      socket.join(`conversation:${conversationId}`);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('send_message', async ({ conversationId, content, type }) => {
    try {
      // ChatService.sendMessage already checks participant status
      const message = await ChatService.sendMessage(conversationId, socket.userId, content, type);
      io.to(`conversation:${conversationId}`).emit('new_message', message);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('typing', ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit('user_typing', {
      userId: socket.userId,
      conversationId,
    });
  });

  socket.on('stop_typing', ({ conversationId }) => {
    socket.to(`conversation:${conversationId}`).emit('user_stopped_typing', {
      userId: socket.userId,
      conversationId,
    });
  });
}

module.exports = chatHandler;
