const express = require('express');
const cors = require('cors');
const helmet = require('helmet');
const morgan = require('morgan');
const hpp = require('hpp');
const path = require('path');

const routes = require('./routes');
const errorHandler = require('./middleware/errorHandler');
const { apiLimiter } = require('./middleware/rateLimiter');
const setupSwagger = require('./config/swagger');
const ApiError = require('./utils/ApiError');
const { sanitizeObject } = require('./utils/sanitize');

const app = express();

// ── Security ────────────────────────────────────────
app.use(helmet());                // Security headers
app.use(hpp());                   // Prevent HTTP parameter pollution

// ── CORS ────────────────────────────────────────────
app.use(cors({
  origin: process.env.CORS_ORIGIN || 'http://localhost:5173',
  credentials: true,
  methods: ['GET', 'POST', 'PUT', 'PATCH', 'DELETE', 'OPTIONS'],
  allowedHeaders: ['Content-Type', 'Authorization'],
}));

// ── Body Parsing ────────────────────────────────────
app.use(express.json({ limit: '10mb' }));
app.use(express.urlencoded({ extended: true }));

// ── XSS Sanitization ───────────────────────────────
// Sanitize all string values in request bodies to prevent stored XSS.
// This runs BEFORE validation so Joi sees the sanitized values.
app.use((req, res, next) => {
  if (req.body && typeof req.body === 'object') {
    req.body = sanitizeObject(req.body);
  }
  next();
});

// ── Logging ─────────────────────────────────────────
if (process.env.NODE_ENV !== 'test') {
  app.use(morgan(process.env.NODE_ENV === 'production' ? 'combined' : 'dev'));
}

// ── Rate Limiting ───────────────────────────────────
app.use('/api/', apiLimiter);

// ── Static Files (uploads) ──────────────────────────
app.use('/uploads', express.static(path.join(__dirname, '../uploads')));

// ── API Documentation ───────────────────────────────
setupSwagger(app);

// ── Health Check ────────────────────────────────────
app.get('/health', (req, res) => {
  res.json({ status: 'ok', timestamp: new Date().toISOString(), uptime: process.uptime() });
});

// ── API Routes ──────────────────────────────────────
app.use('/api/v1', routes);

// ── 404 Handler ─────────────────────────────────────
app.use((req, res, next) => {
  next(ApiError.notFound(`Route ${req.method} ${req.originalUrl} not found`));
});

// ── Error Handler (must be last) ────────────────────
app.use(errorHandler);

module.exports = app;
