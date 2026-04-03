const db = require('../config/database');
const { toBin, fromBin, whereUuid } = require('../utils/uuid');

/**
 * Appointment model — maps to Joshua's `appointment` table.
 *
 * KEY CHANGES from old schema:
 * - Table name: appointments → appointment
 * - IDs: auto-increment int → binary(16) UUID
 * - Status values: 'requested','scheduled','completed','cancelled'
 *   (was: 'pending','accepted','in_progress','completed','cancelled','no_show')
 * - Column renames:
 *   - scheduled_start → start_time
 *   - scheduled_end → end_time
 *   - cancellation_reason → cancelled_reason
 *   - No more: actual_start, actual_end, service_type_id
 * - New: requested_at, cancelled_at
 * - No appointment_tasks table
 * - No service_types table (service_type_id removed)
 *
 * Table: appointment
 * Columns: appointment_id binary(16) PK, caregiver_id binary(16) nullable,
 *          care_receiver_id binary(16), address_id binary(16),
 *          requested_at, start_time, end_time,
 *          status enum('requested','scheduled','completed','cancelled'),
 *          notes, cancelled_reason, cancelled_at, created_at
 */

const TABLE = 'appointment';

const AppointmentModel = {
  async findById(id) {
    return db(TABLE + ' as a')
      .leftJoin('address as addr', function () {
        this.on(db.raw('a.address_id = addr.address_id'));
      })
      .whereRaw(whereUuid('a.appointment_id'), [id])
      .select(
        db.raw(fromBin('a.appointment_id', 'appointment_id')),
        db.raw(fromBin('a.caregiver_id', 'caregiver_id')),
        db.raw(fromBin('a.care_receiver_id', 'care_receiver_id')),
        db.raw(fromBin('a.address_id', 'address_id')),
        'a.requested_at', 'a.start_time', 'a.end_time',
        'a.status', 'a.notes', 'a.cancelled_reason', 'a.cancelled_at', 'a.created_at',
        'addr.address_line1', 'addr.address_line2', 'addr.city', 'addr.state',
        'addr.zip_code', 'addr.latitude', 'addr.longitude'
      )
      .first();
  },

  async create(data) {
    await db(TABLE).insert(data);
    // Caller provides the appointment_id UUID string for re-fetch
    return null; // Service layer will re-fetch
  },

  async update(id, data) {
    await db(TABLE).whereRaw(whereUuid('appointment_id'), [id]).update(data);
    return this.findById(id);
  },

  /**
   * List appointments for a user, filtered by role.
   *
   * SIMPLIFIED from old schema:
   * - No profile-table indirection (user_id = caregiver_id or care_receiver_id)
   * - No service_types join
   * - Joins caregiver/careReceiver tables for names
   */
  async listForUser(userId, role, { status, page = 1, limit = 20, sortBy = 'start_time', order = 'desc' } = {}) {
    const query = db(TABLE + ' as a')
      .leftJoin('caregiver as cg', function () {
        this.on(db.raw('a.caregiver_id = cg.caregiver_id'));
      })
      .leftJoin('careReceiver as cr', function () {
        this.on(db.raw('a.care_receiver_id = cr.care_receiver_id'));
      });

    if (role === 'caregiver') {
      query.whereRaw(whereUuid('a.caregiver_id'), [userId]);
    } else if (role === 'care_receiver') {
      query.whereRaw(whereUuid('a.care_receiver_id'), [userId]);
    }
    // Admin sees all — no filter

    if (status) {
      query.where('a.status', status);
    }

    const offset = (page - 1) * limit;
    const selectFields = [
      db.raw(fromBin('a.appointment_id', 'appointment_id')),
      db.raw(fromBin('a.caregiver_id', 'caregiver_id')),
      db.raw(fromBin('a.care_receiver_id', 'care_receiver_id')),
      db.raw(fromBin('a.address_id', 'address_id')),
      'a.requested_at', 'a.start_time', 'a.end_time',
      'a.status', 'a.notes', 'a.created_at',
      'cg.first_name as caregiver_first_name', 'cg.last_name as caregiver_last_name',
      'cr.first_name as receiver_first_name', 'cr.last_name as receiver_last_name',
    ];

    const allowedSortCols = ['start_time', 'created_at'];
    const safeSort = allowedSortCols.includes(sortBy) ? `a.${sortBy}` : 'a.start_time';

    const [data, [{ total }]] = await Promise.all([
      query.clone()
        .select(selectFields)
        .orderBy(safeSort, order)
        .limit(limit).offset(offset),
      query.clone().count('* as total'),
    ]);

    return { data, total };
  },
};

module.exports = AppointmentModel;
