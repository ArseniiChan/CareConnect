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

// ── Proxy Trust ─────────────────────────────────────
// Railway sits behind multiple reverse-proxy hops (edge -> internal mesh ->
// container). Without trust-proxy set, express-rate-limit refuses to use
// X-Forwarded-For (ERR_ERL_UNEXPECTED_X_FORWARDED_FOR) and req.ip is the
// proxy's IP rather than the real client.
//
// First we tried `trust proxy: 1` and the warning kept firing — Railway has
// at least two hops. Trusting the loopback + CGNAT ranges explicitly is
// more precise than `true` (which would trust any X-Forwarded-For sender)
// and matches Railway's actual network layout (100.64.0.0/10 is CGNAT,
// used internally by Railway).
if (process.env.NODE_ENV === 'production') {
  app.set('trust proxy', ['loopback', 'linklocal', 'uniquelocal', '100.64.0.0/10']);
}

// ── Security ────────────────────────────────────────
app.use(helmet());                // Security headers
app.use(hpp());                   // Prevent HTTP parameter pollution

// ── CORS ────────────────────────────────────────────
// Supports multiple origins via comma-separated CORS_ORIGIN env var.
// Vercel issues a different URL for preview deploys vs production, plus
// developers run the frontend at localhost:5173 — so a single origin won't
// work. Parse a list and check incoming requests against it.
//
// Examples:
//   CORS_ORIGIN=http://localhost:5173
//   CORS_ORIGIN=https://careconnect.vercel.app,https://careconnect-git-main-arsenii.vercel.app,http://localhost:5173
const allowedOrigins = (process.env.CORS_ORIGIN || 'http://localhost:5173')
  .split(',')
  .map((s) => s.trim())
  .filter(Boolean);

app.use(cors({
  origin: (origin, cb) => {
    // Allow non-browser callers (curl, server-to-server) which send no Origin
    if (!origin) return cb(null, true);
    if (allowedOrigins.includes(origin)) return cb(null, true);
    return cb(new Error(`CORS: origin ${origin} not allowed. Set CORS_ORIGIN env var.`));
  },
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
