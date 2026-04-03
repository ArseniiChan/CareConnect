const Joi = require('joi');

/**
 * Auth validations — adapted for Joshua's schema.
 *
 * Changes:
 * - Added birthday and sex fields for care receiver registration
 * - Role values match Joshua's enum
 */

const register = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().min(8).max(128).required(),
    firstName: Joi.string().max(100).required(),
    lastName: Joi.string().max(100).required(),
    phone: Joi.string().max(25).allow('', null),
    role: Joi.string().valid('care_receiver', 'caregiver').required(),
    // Care receiver specific fields
    birthday: Joi.date().iso().allow(null),
    sex: Joi.string().max(50).allow('', null),
  }),
};

const login = {
  body: Joi.object({
    email: Joi.string().email().required(),
    password: Joi.string().required(),
  }),
};

const refreshToken = {
  body: Joi.object({
    refreshToken: Joi.string().required(),
  }),
};

module.exports = { register, login, refreshToken };
