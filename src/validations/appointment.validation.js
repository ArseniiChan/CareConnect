const Joi = require('joi');

/**
 * Appointment validations — adapted for Joshua's schema.
 *
 * Changes:
 * - IDs are now UUID strings, not integers
 * - scheduledStart/scheduledEnd → startTime/endTime
 * - No serviceTypeId (no service_types table)
 * - No tasks (no appointment_tasks table)
 * - Status values: 'requested','scheduled','completed','cancelled'
 * - sortBy default: start_time (not scheduled_start)
 */

const UUID_PATTERN = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

const createAppointment = {
  body: Joi.object({
    addressId: Joi.string().pattern(UUID_PATTERN).required()
      .messages({ 'string.pattern.base': 'addressId must be a valid UUID' }),
    startTime: Joi.date().iso().greater('now').required(),
    endTime: Joi.date().iso().greater(Joi.ref('startTime')).required(),
    notes: Joi.string().max(2000).allow('', null),
  }),
};

const listAppointments = {
  query: Joi.object({
    status: Joi.string().valid('requested', 'scheduled', 'completed', 'cancelled'),
    page: Joi.number().integer().min(1).default(1),
    limit: Joi.number().integer().min(1).max(100).default(20),
    sortBy: Joi.string().valid('start_time', 'created_at').default('start_time'),
    order: Joi.string().valid('asc', 'desc').default('desc'),
  }),
};

module.exports = { createAppointment, listAppointments };
