const UserModel = require('../models/user.model');
const CaregiverModel = require('../models/caregiver.model');
const CareReceiverModel = require('../models/careReceiver.model');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { buildPaginationResponse } = require('../utils/pagination');
const pick = require('../utils/pick');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const list = catchAsync(async (req, res) => {
  const { page, limit, role } = req.query;
  const { data, total } = await UserModel.list({ page, limit, role });
  res.json({ status: 200, ...buildPaginationResponse(data, total, page, limit) });
});

// GET /users/profile — returns the authenticated user's own profile with role data
const getProfile = catchAsync(async (req, res) => {
  const user = await UserModel.findById(req.user.id);
  if (!user) throw ApiError.notFound('User not found');

  const { password_hash, ...safeUser } = user;

  // Merge in role-specific profile data
  let profile = null;
  if (user.role === 'caregiver') {
    profile = await CaregiverModel.findById(user.user_id);
  } else if (user.role === 'care_receiver') {
    profile = await CareReceiverModel.findById(user.user_id);
  }

  res.json({ status: 200, data: { ...safeUser, profile } });
});

const getById = catchAsync(async (req, res) => {
  const id = req.params.id;
  if (!id || !UUID_REGEX.test(id)) throw ApiError.badRequest('Invalid user ID');

  const user = await UserModel.findById(id);
  if (!user) throw ApiError.notFound('User not found');

  const { password_hash, ...safeUser } = user;
  res.json({ status: 200, data: safeUser });
});

const update = catchAsync(async (req, res) => {
  const id = req.params.id;
  if (!id || !UUID_REGEX.test(id)) throw ApiError.badRequest('Invalid user ID');

  // Users can only update their own profile (unless admin)
  if (req.user.role !== 'admin' && req.user.id !== id) {
    throw ApiError.forbidden();
  }

  // Whitelist only allowed fields — prevents mass-assignment
  const allowedFields = ['email'];
  const updates = pick(req.body, allowedFields);

  if (Object.keys(updates).length === 0) {
    throw ApiError.badRequest('No valid fields to update');
  }

  const user = await UserModel.update(id, updates);
  const { password_hash, ...safeUser } = user;
  res.json({ status: 200, data: safeUser });
});

const deactivate = catchAsync(async (req, res) => {
  const id = req.params.id;
  if (!id || !UUID_REGEX.test(id)) throw ApiError.badRequest('Invalid user ID');

  if (req.user.role !== 'admin' && req.user.id !== id) {
    throw ApiError.forbidden();
  }

  await UserModel.deactivate(id);
  res.status(204).send();
});

module.exports = { list, getProfile, getById, update, deactivate };
