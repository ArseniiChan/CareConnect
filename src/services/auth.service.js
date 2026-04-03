const bcrypt = require('bcryptjs');
const jwt = require('jsonwebtoken');
const db = require('../config/database');
const UserModel = require('../models/user.model');
const CaregiverModel = require('../models/caregiver.model');
const CareReceiverModel = require('../models/careReceiver.model');
const ApiError = require('../utils/ApiError');
const { generate: generateUuid, toBin } = require('../utils/uuid');

const BCRYPT_ROUNDS = 12;

function generateAccessToken(user) {
  return jwt.sign(
    { sub: user.user_id, email: user.email, role: user.role },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_ACCESS_EXPIRY || '15m' }
  );
}

function generateRefreshToken(user) {
  return jwt.sign(
    { sub: user.user_id, type: 'refresh' },
    process.env.JWT_SECRET,
    { expiresIn: process.env.JWT_REFRESH_EXPIRY || '7d' }
  );
}

/**
 * Auth service — adapted for Joshua's TiDB schema.
 *
 * KEY ARCHITECTURAL CHANGE:
 * Old: users table → caregiver_profiles / care_receiver_profiles (separate IDs)
 * New: users table → caregiver / careReceiver (SAME ID = user_id = caregiver_id/care_receiver_id)
 *
 * Registration creates BOTH a users row AND a role-specific profile row
 * with the same UUID. This means:
 * - req.user.id (from JWT sub) === caregiver_id in the appointment table
 * - No more _resolveReceiverUserId() / _resolveCaregiverUserId() indirection
 */
const AuthService = {
  async register({ email, password, firstName, lastName, phone, role, birthday, sex }) {
    const existing = await UserModel.findByEmail(email);
    if (existing) {
      throw ApiError.conflict('Email already registered');
    }

    const passwordHash = await bcrypt.hash(password, BCRYPT_ROUNDS);
    const userId = generateUuid();

    // Use a transaction — if the profile insert fails, roll back the user insert
    await db.transaction(async (trx) => {
      // 1. Create auth record in users table
      await trx('users').insert({
        user_id: trx.raw('uuid_to_bin(?)', [userId]),
        email,
        password_hash: passwordHash,
        role,
      });

      // 2. Create role-specific profile with the SAME UUID
      if (role === 'caregiver') {
        await trx('caregiver').insert({
          caregiver_id: trx.raw('uuid_to_bin(?)', [userId]),
          first_name: firstName,
          last_name: lastName,
          email,
          phone: phone || null,
          is_verified: false,
          rating: 0,
        });
      } else if (role === 'care_receiver') {
        await trx('careReceiver').insert({
          care_receiver_id: trx.raw('uuid_to_bin(?)', [userId]),
          first_name: firstName,
          last_name: lastName,
          birthday: birthday || null,
          sex: sex || null,
        });
      }
    });

    // Fetch the created user for token generation
    const user = await UserModel.findByEmail(email);

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    return {
      user: {
        id: user.user_id,
        email: user.email,
        firstName,
        lastName,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  },

  async login({ email, password }) {
    const user = await UserModel.findByEmail(email);
    if (!user || !user.is_active) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const isMatch = await bcrypt.compare(password, user.password_hash);
    if (!isMatch) {
      throw ApiError.unauthorized('Invalid email or password');
    }

    const accessToken = generateAccessToken(user);
    const refreshToken = generateRefreshToken(user);

    // Fetch profile data for the response
    let profile = null;
    if (user.role === 'caregiver') {
      profile = await CaregiverModel.findById(user.user_id);
    } else if (user.role === 'care_receiver') {
      profile = await CareReceiverModel.findById(user.user_id);
    }

    return {
      user: {
        id: user.user_id,
        email: user.email,
        firstName: profile?.first_name || null,
        lastName: profile?.last_name || null,
        role: user.role,
      },
      accessToken,
      refreshToken,
    };
  },

  async refreshToken(token) {
    try {
      const decoded = jwt.verify(token, process.env.JWT_SECRET);
      if (decoded.type !== 'refresh') {
        throw ApiError.unauthorized('Invalid refresh token');
      }

      const user = await UserModel.findById(decoded.sub);
      if (!user || !user.is_active) {
        throw ApiError.unauthorized('User not found or inactive');
      }

      const accessToken = generateAccessToken(user);
      const newRefreshToken = generateRefreshToken(user);

      return { accessToken, refreshToken: newRefreshToken };
    } catch (err) {
      if (err instanceof ApiError) throw err;
      throw ApiError.unauthorized('Invalid refresh token');
    }
  },

  async getProfile(userId) {
    const user = await UserModel.findById(userId);
    if (!user) throw ApiError.notFound('User not found');

    // Get role-specific profile data
    let profile = null;
    if (user.role === 'caregiver') {
      profile = await CaregiverModel.findById(user.user_id);
    } else if (user.role === 'care_receiver') {
      profile = await CareReceiverModel.findById(user.user_id);
    }

    // Merge auth data with profile data, excluding password_hash
    const { password_hash, ...safeUser } = user;
    return { ...safeUser, profile };
  },
};

module.exports = AuthService;
