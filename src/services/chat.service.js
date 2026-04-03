const db = require('../config/database');
const MessageModel = require('../models/message.model');
const ApiError = require('../utils/ApiError');
const { generate: generateUuid, whereUuid } = require('../utils/uuid');

/**
 * Chat service — adapted for Joshua's schema.
 *
 * KEY CHANGES:
 * - No conversations table. Messages are per-appointment (appointment_id FK).
 * - Authorization is done by checking if the user is a participant of the appointment
 *   (care_receiver_id or caregiver_id matches).
 * - sender_role enum replaces user table join for identifying sender type.
 * - No conversation creation step — the appointment IS the conversation.
 */
const ChatService = {

  /**
   * Verify user is a participant of the appointment.
   * Returns 'caregiver' or 'care_receiver'.
   */
  async _verifyParticipant(appointmentId, userId) {
    const appointment = await db('appointment')
      .select(
        db.raw('bin_to_uuid(care_receiver_id) as care_receiver_id'),
        db.raw('bin_to_uuid(caregiver_id) as caregiver_id')
      )
      .whereRaw(whereUuid('appointment_id'), [appointmentId])
      .first();

    if (!appointment) {
      throw ApiError.notFound('Appointment not found');
    }

    if (appointment.care_receiver_id === userId) return 'care_receiver';
    if (appointment.caregiver_id === userId) return 'caregiver';

    throw ApiError.forbidden('You are not a participant in this appointment');
  },

  /**
   * Get messages for an appointment.
   */
  async getMessages(appointmentId, userId, pagination) {
    // Verify the user is a participant
    await this._verifyParticipant(appointmentId, userId);

    // Mark messages as read
    await MessageModel.markAsRead(appointmentId, userId);

    return MessageModel.listByAppointment(appointmentId, pagination);
  },

  /**
   * Send a message in an appointment chat.
   */
  async sendMessage(appointmentId, userId, content) {
    // Verify and get role
    const senderRole = await this._verifyParticipant(appointmentId, userId);

    const messageId = generateUuid();

    await MessageModel.create({
      message_id: db.raw('uuid_to_bin(?)', [messageId]),
      appointment_id: db.raw('uuid_to_bin(?)', [appointmentId]),
      sender_id: db.raw('uuid_to_bin(?)', [userId]),
      sender_role: senderRole,
      message_text: content,
      sent_at: new Date(),
    });

    // Return the created message by re-fetching
    return db('message')
      .select(
        db.raw('bin_to_uuid(message_id) as message_id'),
        db.raw('bin_to_uuid(appointment_id) as appointment_id'),
        db.raw('bin_to_uuid(sender_id) as sender_id'),
        'sender_role', 'message_text', 'sent_at', 'read_at'
      )
      .whereRaw(whereUuid('message_id'), [messageId])
      .first();
  },

  /**
   * List appointments that have messages (chat list for a user).
   * Replaces the old listConversations.
   */
  async listChats(userId, role) {
    // Find all appointments the user is part of that have messages
    const appointments = await db('appointment as a')
      .join('message as m', function () {
        this.on(db.raw('a.appointment_id = m.appointment_id'));
      })
      .where(function () {
        if (role === 'caregiver') {
          this.whereRaw(whereUuid('a.caregiver_id'), [userId]);
        } else {
          this.whereRaw(whereUuid('a.care_receiver_id'), [userId]);
        }
      })
      .select(
        db.raw('bin_to_uuid(a.appointment_id) as appointment_id'),
        db.raw('bin_to_uuid(a.caregiver_id) as caregiver_id'),
        db.raw('bin_to_uuid(a.care_receiver_id) as care_receiver_id'),
        'a.status'
      )
      .groupBy('a.appointment_id')
      .orderByRaw('MAX(m.sent_at) DESC');

    // Enrich with last message
    const enriched = await Promise.all(
      appointments.map(async (appt) => {
        const lastMessage = await MessageModel.getLastMessage(appt.appointment_id);
        return { ...appt, lastMessage };
      })
    );

    return enriched;
  },
};

module.exports = ChatService;
