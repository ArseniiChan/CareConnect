const UserModel = require('../models/user.model');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { buildPaginationResponse } = require('../utils/pagination');

const list = catchAsync(async (req, res) => {
  const { page, limit, role } = req.query;
  const { data, total } = await UserModel.list({ page, limit, role });
  res.json({ status: 200, ...buildPaginationResponse(data, total, page, limit) });
});

// GET /users/profile — returns the authenticated user's own profile
const getProfile = catchAsync(async (req, res) => {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');

  const { password_hash, ...safeUser } = user;
  res.json({ status: 200, data: safeUser });
});

const getById = catchAsync(async (req, res) => {
  // Guard: if :id isn't a valid integer, reject early instead of querying with NaN
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid user ID');

  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  const { password_hash, ...safeUser } = user;
  res.json({ status: 200, data: safeUser });
});

const update = catchAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid user ID');

  // Users can only update their own profile (unless admin)
  if (req.user.role !== 'admin' && req.user.id !== id) {
    throw ApiError.forbidden();
  }

  // SECURITY FIX: Mass-assignment vulnerability.
  // The old code passed req.body directly to the model:
  //   UserModel.update(id, req.body)
  //
  // An attacker could send: { "role": "admin", "is_active": true, "password_hash": "..." }
  // and promote themselves to admin, reactivate a banned account, or overwrite
  // someone's password hash with a known value.
  //
  // Fix: Whitelist only the fields a user is allowed to change.
  const pick = require('../utils/pick');
  const allowedFields = ['first_name', 'last_name', 'phone', 'avatar_url'];
  const updates = pick(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  const user = await UserModel.update(id, updates);
  const { password_hash, ...safeUser } = user;
  res.json({ status: 200, data: safeUser });
});

const deactivate = catchAsync(async (req, res) => {
  if (req.user.role !== 'admin' && req.user.id !== parseInt(req.params.id, 10)) {
    throw ApiError.forbidden();
  }

  await UserModel.deactivate(req.params.id);
  res.status(204).send();
});

module.exports = { list, getProfile, getById, update, deactivate };
