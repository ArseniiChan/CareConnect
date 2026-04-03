const jwt = require('jsonwebtoken');
const ApiError = require('../utils/ApiError');

/**
 * Verify JWT access token from Authorization header.
 * Attaches decoded user to req.user on success.
 *
 * JWT payload:
 *   { sub: <user_id UUID>, email: <string>, role: <string> }
 *
 * After this middleware, req.user contains:
 *   { id: <UUID string>, email: <string>, role: <string> }
 *
 * NOTE: In Joshua's schema, req.user.id === caregiver_id or care_receiver_id.
 * No more profile-table lookups needed.
 */
const authenticate = (req, res, next) => {
  const authHeader = req.headers.authorization;

  if (!authHeader || !authHeader.startsWith('Bearer ')) {
    throw ApiError.unauthorized('Missing or invalid Authorization header');
  }

  const token = authHeader.split(' ')[1];

  try {
    const decoded = jwt.verify(token, process.env.JWT_SECRET);
    req.user = {
      id: decoded.sub,     // UUID string (= caregiver_id or care_receiver_id)
      email: decoded.email,
      role: decoded.role,
    };
    next();
  } catch (err) {
    if (err.name === 'TokenExpiredError') {
      throw ApiError.unauthorized('Token expired');
    }
    throw ApiError.unauthorized('Invalid token');
  }
};

module.exports = authenticate;
