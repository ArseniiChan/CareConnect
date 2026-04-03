const chatHandler = require('./chat.handler');

/**
 * Socket.io handler setup — adapted for Joshua's schema.
 *
 * REMOVED handlers:
 * - notificationHandler → no notifications table
 * - trackingHandler → no caregiver_locations table
 */

function setupSocketHandlers(io) {
  io.on('connection', (socket) => {
    console.log(`User connected: ${socket.userId} (${socket.userRole})`);

    // Join user's personal room for targeted events
    socket.join(`user:${socket.userId}`);

    // Register chat handler
    chatHandler(io, socket);

    socket.on('disconnect', () => {
      console.log(`User disconnected: ${socket.userId}`);
    });
  });
}

module.exports = setupSocketHandlers;
