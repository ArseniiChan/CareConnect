const { Server } = require('socket.io');
const jwt = require('jsonwebtoken');

let io;

// Read the same allowlist the REST app uses so Socket.IO and HTTP stay
// in sync. Both FRONTEND_URL (preferred) and CORS_ORIGIN (legacy) are
// accepted, comma-separated, merged into one list.
function readAllowedOrigins() {
  const list = [process.env.FRONTEND_URL, process.env.CORS_ORIGIN]
    .filter(Boolean)
    .flatMap((v) => v.split(','))
    .map((s) => s.trim())
    .filter(Boolean);
  return list.length > 0 ? list : ['http://localhost:5173'];
}

function initializeSocket(httpServer) {
  const allowedOrigins = readAllowedOrigins();
  io = new Server(httpServer, {
    cors: {
      origin: (origin, cb) => {
        // Allow non-browser callers (curl, server-to-server health checks).
        if (!origin) return cb(null, true);
        if (allowedOrigins.includes(origin)) return cb(null, true);
        return cb(new Error(`Socket.IO CORS: origin ${origin} not allowed.`));
      },
      methods: ['GET', 'POST'],
      credentials: true,
    },
    pingTimeout: 60000,
  });

  // Authenticate socket connections with JWT
  io.use((socket, next) => {
    const token = socket.handshake.auth.token;
    if (!token) {
      return next(new Error('Authentication required'));
    }

    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      socket.userId = decoded.sub;
      socket.userRole = decoded.role;
      next();
    } catch (err) {
      next(new Error('Invalid token'));
    }
  });

  return io;
}

function getIO() {
  if (!io) {
    throw new Error('Socket.io not initialized. Call initializeSocket first.');
  }
  return io;
}

module.exports = { initializeSocket, getIO };
