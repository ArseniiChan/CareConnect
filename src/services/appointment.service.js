const AppointmentModel = require('../models/appointment.model');
const CaregiverModel = require('../models/caregiver.model');
const CareReceiverModel = require('../models/careReceiver.model');
const NotificationService = require('./notification.service');
const ChatService = require('./chat.service');
const ApiError = require('../utils/ApiError');

// ──────────────────────────────────────────────────────────
// APPOINTMENT STATE MACHINE
// ──────────────────────────────────────────────────────────
//
// This is the single most important data structure in the app.
// Every appointment has a `status` field that can only change
// according to these rules:
//
//   ┌─────────┐  accept   ┌──────────┐  check-in  ┌─────────────┐  check-out  ┌───────────┐
//   │ pending ├──────────►│ accepted ├───────────►│ in_progress ├────────────►│ completed │
//   └────┬────┘           └────┬─────┘            └──────┬──────┘             └───────────┘
//        │                     │                         │
//        │ cancel              │ cancel                  │ no_show
//        ▼                     ▼                         ▼
//   ┌───────────┐         ┌───────────┐            ┌─────────┐
//   │ cancelled │         │ cancelled │            │ no_show │
//   └───────────┘         └───────────┘            └─────────┘
//
// Terminal states: completed, cancelled, no_show (no transitions out)
//
// WHY a state machine?
// Without it, you'd rely on ad-hoc if/else checks scattered across controllers.
// Bugs would let you "complete" a cancelled appointment or "cancel" one that's
// already done. The state machine centralizes all transition rules in ONE place.
// When an interviewer asks "how do you handle appointment status?" — you point
// here and say "finite state machine with validated transitions."
//
// WHO can trigger each transition?
// - accept:    caregiver only (any verified caregiver, appointment must be unassigned)
// - decline:   caregiver only (soft pass — appointment stays pending for others)
// - check-in:  assigned caregiver only
// - check-out: assigned caregiver only
// - cancel:    either the care receiver who booked OR the assigned caregiver
//              (but NOT once in_progress — too late, use no_show instead)
// - no_show:   assigned caregiver only (patient didn't answer door, etc.)
// ──────────────────────────────────────────────────────────

const VALID_TRANSITIONS = {
  pending:     ['accepted', 'cancelled'],
  accepted:    ['in_progress', 'cancelled'],
  in_progress: ['completed', 'no_show'],
  completed:   [],   // terminal
  cancelled:   [],   // terminal
  no_show:     [],   // terminal
};

// Human-readable descriptions for error messages
const STATUS_LABELS = {
  pending:     'Pending (waiting for a caregiver)',
  accepted:    'Accepted (caregiver assigned, not yet started)',
  in_progress: 'In Progress (caregiver is on-site)',
  completed:   'Completed',
  cancelled:   'Cancelled',
  no_show:     'No-Show',
};

const AppointmentService = {

  // ── CREATE ──────────────────────────────────────────
  async create(userId, data) {
    const profile = await CareReceiverModel.findByUserId(userId);
    if (!profile) {
      throw ApiError.forbidden('Only care receivers can create appointments');
    }

    const appointment = await AppointmentModel.create({
      care_receiver_id: profile.id,
      service_type_id: data.serviceTypeId,
      address_id: data.addressId,
      scheduled_start: data.scheduledStart,
      scheduled_end: data.scheduledEnd,
      notes: data.notes,
      status: 'pending',
    });

    // Create tasks if provided
    if (data.tasks && data.tasks.length > 0) {
      for (const task of data.tasks) {
        await AppointmentModel.addTask({
          appointment_id: appointment.id,
          description: task.description,
          sort_order: task.sortOrder || 0,
        });
      }
    }

    return AppointmentModel.findById(appointment.id);
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

  // ── ACCEPT ──────────────────────────────────────────
  // A caregiver claims an unassigned pending appointment.
  async accept(appointmentId, userId) {
    const appointment = await this.getById(appointmentId);

    // 1. Must be in a valid state to accept
    this._validateTransition(appointment.status, 'accepted');

    // 2. Must not already be assigned to someone else
    if (appointment.caregiver_id) {
      throw ApiError.conflict('This appointment has already been assigned to a caregiver');
    }

    // 3. Caller must be a caregiver
    const caregiverProfile = await this._requireCaregiverProfile(userId);

    // 4. Perform the transition
    const updated = await AppointmentModel.update(appointmentId, {
      caregiver_id: caregiverProfile.id,
      status: 'accepted',
    });

    // 5. Resolve care_receiver_profiles.id → users.id for the notification
    const receiverUserId = await this._resolveReceiverUserId(appointment.care_receiver_id);

    // 6. Notify the care receiver
    await NotificationService.create({
      userId: receiverUserId,
      type: 'appointment_update',
      title: 'Caregiver Assigned',
      body: `Your appointment has been accepted by a caregiver.`,
      data: { appointmentId, status: 'accepted' },
    });

    // 7. Create a chat conversation between the two parties
    try {
      await ChatService.createConversation(appointmentId, [receiverUserId, userId]);
    } catch (err) {
      // Non-critical — don't fail the accept if chat creation fails
      console.error('Failed to create chat conversation:', err.message);
    }

    return updated;
  },

  // ── DECLINE ─────────────────────────────────────────
  // A caregiver passes on a pending appointment. The appointment
  // stays pending so other caregivers can still pick it up.
  // This is a "soft" action — it doesn't change the appointment status.
  async decline(appointmentId, userId) {
    const appointment = await this.getById(appointmentId);

    if (appointment.status !== 'pending') {
      throw ApiError.badRequest('Can only decline pending appointments');
    }

    // Verify caller is a caregiver (not a care receiver trying to decline)
    await this._requireCaregiverProfile(userId);

    // In a production system you'd record the decline in a separate table
    // (e.g., `appointment_declines`) so you don't re-show this appointment
    // to the same caregiver. For MVP, the appointment just stays pending.
    return { message: 'Appointment declined', appointmentId };
  },

  // ── CHECK-IN (START) ────────────────────────────────
  // The assigned caregiver arrives and begins the appointment.
  async start(appointmentId, userId) {
    const appointment = await this.getById(appointmentId);

    // 1. State transition check
    this._validateTransition(appointment.status, 'in_progress');

    // 2. Only the ASSIGNED caregiver can check in
    await this._requireAssignedCaregiver(appointment, userId);

    // 3. Set actual_start timestamp
    const updated = await AppointmentModel.update(appointmentId, {
      status: 'in_progress',
      actual_start: new Date(),
    });

    // 4. Notify the care receiver
    const receiverUserId = await this._resolveReceiverUserId(appointment.care_receiver_id);
    await NotificationService.create({
      userId: receiverUserId,
      type: 'appointment_update',
      title: 'Caregiver Has Arrived',
      body: 'Your caregiver has checked in and the appointment has started.',
      data: { appointmentId, status: 'in_progress' },
    });

    return updated;
  },

  // ── CHECK-OUT (COMPLETE) ────────────────────────────
  // The assigned caregiver finishes all tasks and ends the appointment.
  async complete(appointmentId, userId) {
    const appointment = await this.getById(appointmentId);

    // 1. State transition check
    this._validateTransition(appointment.status, 'completed');

    // 2. Only the ASSIGNED caregiver can check out
    await this._requireAssignedCaregiver(appointment, userId);

    // 3. Set actual_end timestamp, increment caregiver's appointment count
    const updated = await AppointmentModel.update(appointmentId, {
      status: 'completed',
      actual_end: new Date(),
    });

    // 4. Increment the caregiver's total_appointments counter
    const db = require('../config/database');
    await db('caregiver_profiles')
      .where({ id: appointment.caregiver_id })
      .increment('total_appointments', 1);

    // 5. Notify care receiver that they can now leave a review
    const receiverUserId = await this._resolveReceiverUserId(appointment.care_receiver_id);
    await NotificationService.create({
      userId: receiverUserId,
      type: 'appointment_update',
      title: 'Appointment Completed',
      body: 'Your appointment is complete. Please take a moment to rate your caregiver.',
      data: { appointmentId, status: 'completed', canReview: true },
    });

    return updated;
  },

  // ── CANCEL ──────────────────────────────────────────
  // Either the care receiver OR the assigned caregiver can cancel,
  // but ONLY before the appointment is in_progress.
  async cancel(appointmentId, userId, reason) {
    const appointment = await this.getById(appointmentId);

    // 1. State transition check (blocks cancel from in_progress, completed, etc.)
    this._validateTransition(appointment.status, 'cancelled');

    // 2. Verify the caller is a participant (the booker or the assigned caregiver)
    await this._requireParticipant(appointment, userId);

    // 3. Require a cancellation reason
    if (!reason || reason.trim().length === 0) {
      throw ApiError.badRequest('A cancellation reason is required');
    }

    // 4. Perform the cancellation
    const updated = await AppointmentModel.update(appointmentId, {
      status: 'cancelled',
      cancellation_reason: reason.trim(),
    });

    // 5. Notify the OTHER party
    const cancellerProfile = await CaregiverModel.findByUserId(userId);
    const isCaregiverCancelling = cancellerProfile && cancellerProfile.id === appointment.caregiver_id;

    if (isCaregiverCancelling) {
      // Caregiver cancelled → notify care receiver
      const receiverUserId = await this._resolveReceiverUserId(appointment.care_receiver_id);
      await NotificationService.create({
        userId: receiverUserId,
        type: 'appointment_update',
        title: 'Appointment Cancelled by Caregiver',
        body: `Your caregiver has cancelled the appointment. Reason: ${reason}`,
        data: { appointmentId, status: 'cancelled', cancelledBy: 'caregiver' },
      });
    } else if (appointment.caregiver_id) {
      // Care receiver cancelled → notify caregiver (if one was assigned)
      const caregiverUserId = await this._resolveCaregiverUserId(appointment.caregiver_id);
      await NotificationService.create({
        userId: caregiverUserId,
        type: 'appointment_update',
        title: 'Appointment Cancelled by Client',
        body: `The care receiver has cancelled the appointment. Reason: ${reason}`,
        data: { appointmentId, status: 'cancelled', cancelledBy: 'care_receiver' },
      });
    }

    return updated;
  },

  // ── NO-SHOW ─────────────────────────────────────────
  // The caregiver arrived but the patient didn't show. Only callable
  // from in_progress (caregiver already checked in).
  async noShow(appointmentId, userId) {
    const appointment = await this.getById(appointmentId);

    this._validateTransition(appointment.status, 'no_show');
    await this._requireAssignedCaregiver(appointment, userId);

    const updated = await AppointmentModel.update(appointmentId, {
      status: 'no_show',
      actual_end: new Date(),
    });

    const receiverUserId = await this._resolveReceiverUserId(appointment.care_receiver_id);
    await NotificationService.create({
      userId: receiverUserId,
      type: 'appointment_update',
      title: 'Marked as No-Show',
      body: 'Your caregiver marked this appointment as a no-show.',
      data: { appointmentId, status: 'no_show' },
    });

    return updated;
  },

  // ── TASKS ───────────────────────────────────────────
  async getTasks(appointmentId) {
    return AppointmentModel.getTasks(appointmentId);
  },

  async addTask(appointmentId, taskData) {
    return AppointmentModel.addTask({
      appointment_id: appointmentId,
      description: taskData.description,
      sort_order: taskData.sortOrder || 0,
    });
  },

  async toggleTask(taskId, completed) {
    return AppointmentModel.updateTask(taskId, {
      is_completed: completed,
      completed_at: completed ? new Date() : null,
    });
  },

  // ──────────────────────────────────────────────────────
  // PRIVATE HELPERS
  // ──────────────────────────────────────────────────────

  /**
   * Validate that a status transition is allowed.
   * Throws ApiError.badRequest with a clear message if not.
   */
  _validateTransition(currentStatus, newStatus) {
    const allowed = VALID_TRANSITIONS[currentStatus];
    if (!allowed || !allowed.includes(newStatus)) {
      const currentLabel = STATUS_LABELS[currentStatus] || currentStatus;
      const newLabel = STATUS_LABELS[newStatus] || newStatus;
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
   * Verify the caller is a caregiver and return their profile.
   * Used for accept (any caregiver) and decline.
   */
  async _requireCaregiverProfile(userId) {
    const profile = await CaregiverModel.findByUserId(userId);
    if (!profile) {
      throw ApiError.forbidden('Only caregivers can perform this action');
    }
    return profile;
  },

  /**
   * Verify the caller is THE ASSIGNED caregiver for this specific appointment.
   * Used for start, complete, no_show — actions only the assigned caregiver
   * should be able to perform.
   *
   * WHY separate from _requireCaregiverProfile?
   * "Any caregiver can accept" vs "only the ASSIGNED caregiver can check in."
   * Different authorization levels for different actions.
   */
  async _requireAssignedCaregiver(appointment, userId) {
    const profile = await CaregiverModel.findByUserId(userId);
    if (!profile) {
      throw ApiError.forbidden('Only caregivers can perform this action');
    }
    if (appointment.caregiver_id !== profile.id) {
      throw ApiError.forbidden(
        'Only the assigned caregiver can perform this action. ' +
        `This appointment is assigned to caregiver #${appointment.caregiver_id}.`
      );
    }
    return profile;
  },

  /**
   * Verify the caller is either the care receiver who booked the appointment
   * OR the assigned caregiver. Used for cancel — both parties can cancel.
   */
  async _requireParticipant(appointment, userId) {
    // Check if the user is the care receiver who booked
    const receiverProfile = await CareReceiverModel.findByUserId(userId);
    if (receiverProfile && receiverProfile.id === appointment.care_receiver_id) {
      return 'care_receiver';
    }

    // Check if the user is the assigned caregiver
    if (appointment.caregiver_id) {
      const caregiverProfile = await CaregiverModel.findByUserId(userId);
      if (caregiverProfile && caregiverProfile.id === appointment.caregiver_id) {
        return 'caregiver';
      }
    }

    throw ApiError.forbidden(
      'Only the care receiver who booked this appointment or the assigned caregiver can perform this action'
    );
  },

  /**
   * Resolve care_receiver_profiles.id → users.id
   *
   * WHY THIS IS NEEDED:
   * The appointments table stores care_receiver_id as a FK to
   * care_receiver_profiles.id (NOT users.id). But notifications
   * need users.id. This is a consequence of the profile-table design:
   *
   *   users.id = 42
   *   care_receiver_profiles.id = 7, user_id = 42
   *   appointments.care_receiver_id = 7  ← profile ID, not user ID
   *
   * We need to hop through the profile table to get the user ID.
   */
  async _resolveReceiverUserId(careReceiverProfileId) {
    const db = require('../config/database');
    const profile = await db('care_receiver_profiles')
      .where({ id: careReceiverProfileId })
      .select('user_id')
      .first();
    if (!profile) throw ApiError.internal('Care receiver profile not found');
    return profile.user_id;
  },

  /**
   * Resolve caregiver_profiles.id → users.id
   * Same reasoning as above but for the caregiver side.
   */
  async _resolveCaregiverUserId(caregiverProfileId) {
    const db = require('../config/database');
    const profile = await db('caregiver_profiles')
      .where({ id: caregiverProfileId })
      .select('user_id')
      .first();
    if (!profile) throw ApiError.internal('Caregiver profile not found');
    return profile.user_id;
  },
};

module.exports = AppointmentService;
