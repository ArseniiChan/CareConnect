const ChatService = require('../services/chat.service');

/**
 * Socket.io chat handler — adapted for Joshua's schema.
 *
 * KEY CHANGES:
 * - No conversations table. Rooms are per-appointment (not per-conversation).
 * - Authorization checks if the user is a participant of the appointment.
 * - Events renamed: join_conversation → join_appointment_chat, etc.
 */

function chatHandler(io, socket) {
  socket.on('join_appointment_chat', async ({ appointmentId }) => {
    try {
      // _verifyParticipant throws if user is not a participant
      await ChatService._verifyParticipant(appointmentId, socket.userId);
      socket.join(`appointment_chat:${appointmentId}`);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('send_message', async ({ appointmentId, content }) => {
    try {
      const message = await ChatService.sendMessage(appointmentId, socket.userId, content);
      io.to(`appointment_chat:${appointmentId}`).emit('new_message', message);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  socket.on('typing', ({ appointmentId }) => {
    socket.to(`appointment_chat:${appointmentId}`).emit('user_typing', {
      userId: socket.userId,
      appointmentId,
    });
  });

  socket.on('stop_typing', ({ appointmentId }) => {
    socket.to(`appointment_chat:${appointmentId}`).emit('user_stopped_typing', {
      userId: socket.userId,
      appointmentId,
    });
  });
}

module.exports = chatHandler;
