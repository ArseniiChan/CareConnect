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
   *
   * CAREGIVER DISCOVERY SEMANTIC (important):
   * A caregiver cannot logically own an appointment in `requested` state — by
   * the FSM, `requested` means `caregiver_id IS NULL`. So when a caregiver
   * queries `?status=requested`, they want to discover OPEN requests, not see
   * their own (which would always be empty). We treat this combination as the
   * canonical "open requests" query: status='requested' AND caregiver_id IS NULL.
   *
   * For any other status filter, caregivers see only appointments assigned to them.
   *
   * RADIUS FILTER (caregiver discovery only):
   * If `lat`/`lng` are provided we add a Haversine distance column and (when
   * `radiusMiles` is set) filter rows beyond the radius. We use Haversine in
   * raw SQL because TiDB doesn't support spatial types out of the box.
   * Rows whose address has NULL lat/lng are skipped from the radius filter
   * (returned with distance_miles = NULL) so a missing geocode doesn't hide
   * a real request — caller can decide whether to render them.
   */
  async listForUser(userId, role, opts = {}) {
    const {
      status, page = 1, limit = 20, sortBy = 'start_time', order = 'desc',
      lat, lng, radiusMiles,
    } = opts;
    const query = db(TABLE + ' as a')
      .leftJoin('caregiver as cg', function () {
        this.on(db.raw('a.caregiver_id = cg.caregiver_id'));
      })
      .leftJoin('careReceiver as cr', function () {
        this.on(db.raw('a.care_receiver_id = cr.care_receiver_id'));
      })
      .leftJoin('address as addr', function () {
        this.on(db.raw('a.address_id = addr.address_id'));
      });

    if (role === 'caregiver') {
      if (status === 'requested') {
        // Caregiver discovery: open, unassigned requests
        query.whereNull('a.caregiver_id').where('a.status', 'requested');
      } else {
        // Caregiver's own assignments
        query.whereRaw(whereUuid('a.caregiver_id'), [userId]);
        if (status) query.where('a.status', status);
      }
    } else if (role === 'care_receiver') {
      query.whereRaw(whereUuid('a.care_receiver_id'), [userId]);
      if (status) query.where('a.status', status);
    } else {
      // Admin sees all
      if (status) query.where('a.status', status);
    }

    // Haversine: 3959 = Earth's mean radius in miles. Returns NULL whenever
    // either input is NULL, so we don't accidentally filter out un-geocoded
    // rows when computing the column for display only.
    const haversineSql = `
      3959 * ACOS(
        LEAST(1.0,
          COS(RADIANS(?)) * COS(RADIANS(addr.latitude))
          * COS(RADIANS(addr.longitude) - RADIANS(?))
          + SIN(RADIANS(?)) * SIN(RADIANS(addr.latitude))
        )
      )
    `;

    const hasOrigin = typeof lat === 'number' && typeof lng === 'number'
      && !Number.isNaN(lat) && !Number.isNaN(lng);

    if (hasOrigin && typeof radiusMiles === 'number' && radiusMiles > 0) {
      // Filter: keep only rows within the radius (NULLs excluded by the < cmp).
      // Caregiver discovery typically wants this; care receivers shouldn't pass it.
      query.whereNotNull('addr.latitude').whereNotNull('addr.longitude');
      query.whereRaw(`${haversineSql} <= ?`, [lat, lng, lat, radiusMiles]);
    }

    const offset = (page - 1) * limit;
    const selectFields = [
      db.raw(fromBin('a.appointment_id', 'appointment_id')),
      db.raw(fromBin('a.caregiver_id', 'caregiver_id')),
      db.raw(fromBin('a.care_receiver_id', 'care_receiver_id')),
      db.raw(fromBin('a.address_id', 'address_id')),
      'a.requested_at', 'a.start_time', 'a.end_time',
      'a.status', 'a.notes', 'a.created_at',
      'addr.address_line1', 'addr.address_line2', 'addr.city', 'addr.state',
      'addr.zip_code', 'addr.latitude', 'addr.longitude',
      'cg.first_name as caregiver_first_name', 'cg.last_name as caregiver_last_name',
      'cr.first_name as receiver_first_name', 'cr.last_name as receiver_last_name',
    ];
    if (hasOrigin) {
      selectFields.push(db.raw(`${haversineSql} as distance_miles`, [lat, lng, lat]));
    }

    const allowedSortCols = ['start_time', 'created_at'];
    const safeSort = allowedSortCols.includes(sortBy) ? `a.${sortBy}` : 'a.start_time';

    let listQuery = query.clone().select(selectFields);
    // When radius is in play, sort by distance ascending — the closest open
    // request is the most relevant card to show first.
    if (hasOrigin && typeof radiusMiles === 'number' && radiusMiles > 0) {
      listQuery = listQuery.orderByRaw(`${haversineSql} ASC`, [lat, lng, lat]);
    } else {
      listQuery = listQuery.orderBy(safeSort, order);
    }

    const [data, [{ total }]] = await Promise.all([
      listQuery.limit(limit).offset(offset),
      query.clone().count('* as total'),
    ]);

    return { data, total };
  },
};

module.exports = AppointmentModel;
