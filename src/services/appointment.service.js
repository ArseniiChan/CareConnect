const db = require('../config/database');
const AppointmentModel = require('../models/appointment.model');
const CaregiverModel = require('../models/caregiver.model');
const CareReceiverModel = require('../models/careReceiver.model');
const ApiError = require('../utils/ApiError');
const { generate: generateUuid, toBin, whereUuid } = require('../utils/uuid');

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
  // RACE CONDITION FIX (preserved from original):
  // Atomic UPDATE with WHERE clause checks both conditions.
  // If affectedRows === 0, someone else got there first.
  async accept(appointmentId, userId) {
    const appointment = await this.getById(appointmentId);

    // 1. State transition check
    this._validateTransition(appointment.status, 'scheduled');

    // 2. Must not already be assigned
    if (appointment.caregiver_id) {
      throw ApiError.conflict('This appointment has already been assigned to a caregiver');
    }

    // 3. Caller must be a caregiver
    const caregiver = await CaregiverModel.findById(userId);
    if (!caregiver) {
      throw ApiError.forbidden('Only caregivers can accept appointments');
    }

    // 4. Atomic conditional update — prevents race condition
    const affectedRows = await db('appointment')
      .whereRaw(whereUuid('appointment_id'), [appointmentId])
      .where({ status: 'requested' })
      .whereNull('caregiver_id')
      .update({
        caregiver_id: db.raw('uuid_to_bin(?)', [userId]),
        status: 'scheduled',
      });

    if (affectedRows === 0) {
      throw ApiError.conflict(
        'This appointment was just accepted by another caregiver. Please try a different appointment.'
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
  // The assigned caregiver finishes the appointment.
  async complete(appointmentId, userId) {
    const appointment = await this.getById(appointmentId);

    // 1. State transition check
    this._validateTransition(appointment.status, 'completed');

    // 2. Only the ASSIGNED caregiver can complete
    this._requireAssignedCaregiver(appointment, userId);

    // 3. Update status
    return AppointmentModel.update(appointmentId, {
      status: 'completed',
    });
  },

  // ── CANCEL ──────────────────────────────────────────
  // Either the care receiver or assigned caregiver can cancel.
  async cancel(appointmentId, userId, reason) {
    const appointment = await this.getById(appointmentId);

    // 1. State transition check
    this._validateTransition(appointment.status, 'cancelled');

    // 2. Verify the caller is a participant
    this._requireParticipant(appointment, userId);

    // 3. Require a cancellation reason
    if (!reason || reason.trim().length === 0) {
      throw ApiError.badRequest('A cancellation reason is required');
    }

    // 4. Perform the cancellation
    return AppointmentModel.update(appointmentId, {
      status: 'cancelled',
      cancelled_reason: reason.trim(),
      cancelled_at: new Date(),
    });
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
