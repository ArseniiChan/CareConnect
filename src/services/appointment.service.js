const db = require('../config/database');
const AppointmentModel = require('../models/appointment.model');
const CaregiverModel = require('../models/caregiver.model');
const CareReceiverModel = require('../models/careReceiver.model');
const ApiError = require('../utils/ApiError');
const { generate: generateUuid, toBin, whereUuid } = require('../utils/uuid');

// Platform take-rate, expressed in basis points (1 bp = 0.01%).
// 2000 bp = 20% — the platform keeps 20% of each completed booking,
// caregiver receives the remaining 80%. This is the only knob the
// application owns; the per-caregiver hourly rate lives in caregiver.hourly_rate_cents
// and is read inside sp_complete_appointment so payouts stay consistent
// even if rates change between booking and completion.
const PLATFORM_FEE_BPS = 2000;

/**
 * Invoke a MySQL stored procedure with one OUT parameter and return its value.
 *
 * Why we go this manual path: Knex's .raw() doesn't handle CALL ... ; SELECT @x
 * neatly because TiDB returns one ResultSet per statement. We use a single
 * mysql2 call against the underlying connection to keep things deterministic.
 */
async function callProcedure(procName, inParams) {
  const placeholders = inParams.map(() => '?').concat('@out_result').join(', ');
  const sql = `CALL ${procName}(${placeholders})`;
  await db.raw(sql, inParams);
  const [rows] = await db.raw('SELECT @out_result AS result');
  // mysql2 wraps the rows in [rows, fields]; knex unwraps to [rows] depending
  // on the driver mode. Handle both shapes defensively.
  const row = Array.isArray(rows) ? rows[0] : rows;
  return row?.result ?? null;
}

// ──────────────────────────────────────────────────────────
// APPOINTMENT STATE MACHINE — ADAPTED FOR JOSHUA'S SCHEMA
// ──────────────────────────────────────────────────────────
//
// Joshua's appointment status enum: 'requested','scheduled','completed','cancelled'
//
// This is SIMPLER than the old state machine (no 'in_progress' or 'no_show'):
//
//   ┌───────────┐  accept   ┌───────────┐  complete  ┌───────────┐
//   │ requested ├──────────►│ scheduled ├───────────►│ completed │
//   └────┬──────┘           └─────┬─────┘            └───────────┘
//        │                        │
//        │ cancel                 │ cancel
//        ▼                        ▼
//   ┌───────────┐           ┌───────────┐
//   │ cancelled │           │ cancelled │
//   └───────────┘           └───────────┘
//
// Status mapping from old → new:
//   pending     → requested
//   accepted    → scheduled
//   in_progress → (removed — no check-in step)
//   completed   → completed
//   cancelled   → cancelled
//   no_show     → (removed)
//
// Terminal states: completed, cancelled
// ──────────────────────────────────────────────────────────

const VALID_TRANSITIONS = {
  requested:  ['scheduled', 'cancelled'],
  scheduled:  ['completed', 'cancelled'],
  completed:  [],   // terminal
  cancelled:  [],   // terminal
};

const STATUS_LABELS = {
  requested:  'Requested (waiting for a caregiver)',
  scheduled:  'Scheduled (caregiver assigned)',
  completed:  'Completed',
  cancelled:  'Cancelled',
};

const AppointmentService = {

  // ── CREATE ──────────────────────────────────────────
  async create(userId, data) {
    // Verify caller is a care receiver
    const profile = await CareReceiverModel.findById(userId);
    if (!profile) {
      throw ApiError.forbidden('Only care receivers can create appointments');
    }

    const appointmentId = generateUuid();

    await db('appointment').insert({
      appointment_id: db.raw('uuid_to_bin(?)', [appointmentId]),
      care_receiver_id: db.raw('uuid_to_bin(?)', [userId]),
      address_id: db.raw('uuid_to_bin(?)', [data.addressId]),
      start_time: data.startTime,
      end_time: data.endTime,
      notes: data.notes || null,
      status: 'requested',
      requested_at: new Date(),
    });

    return AppointmentModel.findById(appointmentId);
  },

  // ── LIST ────────────────────────────────────────────
  async list(userId, role, filters) {
    return AppointmentModel.listForUser(userId, role, filters);
  },

  // ── GET BY ID ───────────────────────────────────────
  async getById(id) {
    const appointment = await AppointmentModel.findById(id);
    if (!appointment) throw ApiError.notFound('Appointment not found');
    return appointment;
  },

  // ── ACCEPT (requested → scheduled) ─────────────────
  // A caregiver claims an unassigned requested appointment.
  //
  // The race-safe UPDATE lives inside the stored procedure
  // sp_accept_appointment (database/db_enhancements.sql). The DB does the
  // atomic claim and reports the outcome via the OUT parameter, so two
  // caregivers tapping at the same instant cannot both win — exactly one
  // gets 'accepted', the other gets 'unavailable' and we surface a 409.
  //
  // We still do JS-side validation (caller is a caregiver, friendly errors)
  // to short-circuit obvious failures without a DB roundtrip and to keep
  // error messages consistent.
  async accept(appointmentId, userId) {
    const caregiver = await CaregiverModel.findById(userId);
    if (!caregiver) {
      throw ApiError.forbidden('Only caregivers can accept appointments');
    }

    const result = await callProcedure('sp_accept_appointment', [userId, appointmentId]);

    if (result === 'unavailable') {
      throw ApiError.conflict(
        'This appointment was just accepted by another caregiver, or is no longer open.'
      );
    }
    return AppointmentModel.findById(appointmentId);
  },

  // ── DECLINE ─────────────────────────────────────────
  // A caregiver passes on a requested appointment. Stays requested.
  async decline(appointmentId, userId) {
    const appointment = await this.getById(appointmentId);

    if (appointment.status !== 'requested') {
      throw ApiError.badRequest('Can only decline requested appointments');
    }

    // Verify caller is a caregiver
    const caregiver = await CaregiverModel.findById(userId);
    if (!caregiver) {
      throw ApiError.forbidden('Only caregivers can decline appointments');
    }

    return { message: 'Appointment declined', appointmentId };
  },

  // ── COMPLETE (scheduled → completed) ────────────────
  // Delegated to sp_complete_appointment, which:
  //   1. Validates the caller is the assigned caregiver
  //   2. Reads the caregiver's hourly_rate_cents from their row
  //   3. Calculates total = hours × rate, splits into platform fee + payout
  //   4. Updates the appointment row AND inserts a payment row in one TXN
  // Multi-statement atomic procedure with marketplace economics — exactly
  // the kind of work a stored procedure exists to do.
  async complete(appointmentId, userId) {
    const result = await callProcedure(
      'sp_complete_appointment',
      [userId, appointmentId, PLATFORM_FEE_BPS]
    );

    if (result === 'not_found') throw ApiError.notFound('Appointment not found');
    if (result === 'wrong_state') {
      throw ApiError.badRequest('This appointment cannot be completed from its current state.');
    }
    if (result === 'forbidden') {
      throw ApiError.forbidden('Only the assigned caregiver can complete this appointment.');
    }
    return AppointmentModel.findById(appointmentId);
  },

  // ── CANCEL ──────────────────────────────────────────
  // Delegated to sp_cancel_appointment, which performs the role check
  // (care receiver or assigned caregiver) inside the database itself —
  // defense-in-depth on top of our middleware authorization.
  async cancel(appointmentId, userId, reason) {
    if (!reason || reason.trim().length === 0) {
      throw ApiError.badRequest('A cancellation reason is required');
    }

    const result = await callProcedure(
      'sp_cancel_appointment',
      [userId, appointmentId, reason.trim()]
    );

    if (result === 'not_found') throw ApiError.notFound('Appointment not found');
    if (result === 'terminal') {
      throw ApiError.badRequest('This appointment is already completed or cancelled.');
    }
    if (result === 'forbidden') {
      throw ApiError.forbidden(
        'Only the care receiver or the assigned caregiver can cancel this appointment.'
      );
    }
    return AppointmentModel.findById(appointmentId);
  },

  // ──────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────

  _validateTransition(currentStatus, newStatus) {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      const currentLabel = STATUS_LABELS[currentStatus] || currentStatus;
      const allowedStr = (allowed && allowed.length > 0)
        ? allowed.map(s => STATUS_LABELS[s] || s).join(', ')
        : 'none (this is a terminal state)';

      throw ApiError.badRequest(
        `Invalid status transition: cannot go from '${currentStatus}' to '${newStatus}'. ` +
        `Current state: ${currentLabel}. Allowed transitions: ${allowedStr}.`
      );
    }
  },

  /**
   * Verify the caller is THE ASSIGNED caregiver for this appointment.
   *
   * SIMPLIFIED from old schema:
   * Old: Look up caregiver_profiles.id by user_id, compare to appointment.caregiver_id
   * New: appointment.caregiver_id === user_id directly (no profile-table hop)
   */
  _requireAssignedCaregiver(appointment, userId) {
    if (appointment.caregiver_id !== userId) {
      throw ApiError.forbidden(
        'Only the assigned caregiver can perform this action.'
      );
    }
  },

  /**
   * Verify the caller is either the care receiver or the assigned caregiver.
   *
   * SIMPLIFIED: Direct ID comparison, no profile table lookups.
   */
  _requireParticipant(appointment, userId) {
    const isReceiver = appointment.care_receiver_id === userId;
    const isCaregiver = appointment.caregiver_id === userId;

    if (!isReceiver && !isCaregiver) {
      throw ApiError.forbidden(
        'Only the care receiver who booked this appointment or the assigned caregiver can perform this action'
      );
    }

    return isCaregiver ? 'caregiver' : 'care_receiver';
  },
};

module.exports = AppointmentService;
