const db = require('../config/database');
const { toBin, fromBin, whereUuid } = require('../utils/uuid');

/**
 * Message model — maps to Joshua's `message` table.
 *
 * KEY CHANGES from old schema:
 * - No conversations table. Messages are per-appointment (appointment_id FK).
 * - No conversation_participants table. Authorization is done via appointment ownership.
 * - sender_role enum('caregiver','care_receiver') instead of joining users table.
 * - Column renames: content → message_text, created_at → sent_at, is_read → read_at (nullable datetime)
 * - IDs: auto-increment int → binary(16) UUID
 *
 * Table: message
 * Columns: message_id binary(16) PK, appointment_id binary(16), sender_id binary(16),
 *          sender_role enum('caregiver','care_receiver'), message_text text,
 *          sent_at datetime, read_at datetime
 */

const TABLE = 'message';

const MessageModel = {
  async create(data) {
    await db(TABLE).insert(data);
    return null; // Service layer re-fetches
  },

  /**
   * List messages for an appointment with pagination.
   * Replaces the old listByConversation — no conversation_id needed.
   */
  async listByAppointment(appointmentId, { page = 1, limit = 50 } = {}) {
    const offset = (page - 1) * limit;

    const [data, [{ total }]] = await Promise.all([
      db(TABLE)
        .select(
          db.raw(fromBin('message_id')),
          db.raw(fromBin('appointment_id')),
          db.raw(fromBin('sender_id')),
          'sender_role', 'message_text', 'sent_at', 'read_at'
        )
        .whereRaw(whereUuid('appointment_id'), [appointmentId])
        .orderBy('sent_at', 'desc')
        .limit(limit).offset(offset),
      db(TABLE)
        .whereRaw(whereUuid('appointment_id'), [appointmentId])
        .count('* as total'),
    ]);

    return { data: data.reverse(), total }; // Reverse so oldest first in page
  },

  /**
   * Mark messages as read for a specific user in an appointment.
   * read_at is a datetime (null = unread), not a boolean like the old schema.
   */
  async markAsRead(appointmentId, userId) {
    return db(TABLE)
      .whereRaw(whereUuid('appointment_id'), [appointmentId])
      .whereNull('read_at')
      .whereRaw(`sender_id != uuid_to_bin(?)`, [userId])
      .update({ read_at: new Date() });
  },

  /**
   * Get the most recent message for an appointment (for chat list preview).
   */
  async getLastMessage(appointmentId) {
    return db(TABLE)
      .select(
        db.raw(fromBin('message_id')),
        db.raw(fromBin('sender_id')),
        'sender_role', 'message_text', 'sent_at'
      )
      .whereRaw(whereUuid('appointment_id'), [appointmentId])
      .orderBy('sent_at', 'desc')
      .first();
  },
};

module.exports = MessageModel;
