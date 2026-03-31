require('dotenv').config();

const http = require('http');
const app = require('./src/app');
const { initializeSocket } = require('./src/config/socket');
const setupSocketHandlers = require('./src/socket');
const db = require('./src/config/database');

const PORT = process.env.PORT || 3000;

// ── SECURITY: Validate critical config at startup ────────
// VULNERABILITY: If JWT_SECRET is missing or left as the .env.example default,
// every JWT is signed with a known key. An attacker could forge tokens for any
// user, including admin, without ever logging in.
//
// This is the #1 most common JWT vulnerability in real-world apps.
const WEAK_SECRETS = [
  'your-super-secret-jwt-key-change-this',
  'secret', 'jwt-secret', 'changeme', 'password', 'test',
];

if (!process.env.JWT_SECRET || WEAK_SECRETS.includes(process.env.JWT_SECRET)) {
  console.error('\n  FATAL: JWT_SECRET is missing or set to a known weak value.');
  console.error('  Anyone can forge authentication tokens with this secret.');
  console.error('  Generate a strong secret: node -e "console.log(require(\'crypto\').randomBytes(64).toString(\'hex\'))"');
  console.error('  Then set it in your .env file.\n');

  if (process.env.NODE_ENV === 'production') {
    process.exit(1); // Hard kill in production
  } else {
    console.warn('  Continuing in development mode with weak secret (DO NOT DEPLOY THIS).\n');
  }
}

// Create HTTP server (needed for Socket.io to attach to)
const server = http.createServer(app);

// Initialize WebSocket
const io = initializeSocket(server);
setupSocketHandlers(io);

// Verify database connection, then start server
db.raw('SELECT 1')
  .then(() => {
    console.log('Database connected');
    server.listen(PORT, () => {
      console.log(`
  ╔══════════════════════════════════════════╗
  ║          CareConnect API Server          ║
  ╠══════════════════════════════════════════╣
  ║  Environment: ${(process.env.NODE_ENV || 'development').padEnd(25)}║
  ║  Port:        ${String(PORT).padEnd(25)}║
  ║  API:         http://localhost:${PORT}/api/v1  ║
  ║  Docs:        http://localhost:${PORT}/api/docs║
  ║  Health:      http://localhost:${PORT}/health  ║
  ║  WebSocket:   ws://localhost:${PORT}           ║
  ╚══════════════════════════════════════════╝
      `);
    });
  })
  .catch((err) => {
    console.error('Database connection failed:', err.message);
    console.error('Make sure MySQL is running and .env is configured correctly.');
    process.exit(1);
  });

// Graceful shutdown
process.on('SIGTERM', () => {
  console.log('SIGTERM received. Shutting down...');
  server.close(() => {
    db.destroy();
    process.exit(0);
  });
});

// Catch unhandled promise rejections instead of crashing silently
process.on('unhandledRejection', (reason, promise) => {
  console.error('Unhandled Rejection at:', promise, 'reason:', reason);
});
