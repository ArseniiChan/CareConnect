const Joi = require('joi');

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Common validations — adapted for Joshua's schema.
 *
 * Changes:
 * - idParam now validates UUID strings instead of integers
 * - Address fields renamed to match Joshua's columns:
 *   streetAddress → addressLine1, aptUnit → addressLine2,
 *   label → nickname, isDefault → isPrimary
 */

const idParam = {
  params: Joi.object({
    id: Joi.string().pattern(UUID_PATTERN).required()
      .messages({ 'string.pattern.base': 'id must be a valid UUID' }),
  }),
};

const paginationQuery = {
  query: Joi.object({
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
  }),
};

const createAddress = {
  body: Joi.object({
    nickname: Joi.string().max(100).default('home'),
    addressLine1: Joi.string().max(255).required(),
    addressLine2: Joi.string().max(255).allow('', null),
    city: Joi.string().max(100).required(),
    state: Joi.string().max(100).required(),
    zipCode: Joi.string().max(20).required(),
    latitude: Joi.number().min(-90).max(90),
    longitude: Joi.number().min(-180).max(180),
    isPrimary: Joi.boolean().default(false),
  }),
};

module.exports = { idParam, paginationQuery, createAddress };
