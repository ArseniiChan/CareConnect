const db = require('../config/database');
const { toBin, fromBin, whereUuid } = require('../utils/uuid');

/**
 * Caregiver model — maps to Joshua's `caregiver` table.
 *
 * KEY CHANGE from old schema:
 * - Old: caregiver_profiles table with user_id FK → users table
 * - New: caregiver table IS the profile. caregiver_id = user_id (same UUID)
 *
 * Table: caregiver
 * Columns: caregiver_id binary(16) PK, first_name, last_name, email, phone,
 *          is_verified, rating, created_at, profile_picture_url
 */

const TABLE = 'caregiver';

const CaregiverModel = {
  /**
   * Find caregiver by their ID (which is also the user_id).
   * In the old schema, findByUserId was needed because profile.id ≠ user.id.
   * Now caregiver_id === user_id, so findById handles both cases.
   */
  async findById(id) {
    return db(TABLE)
      .select(
        db.raw(fromBin('caregiver_id')),
        'first_name', 'last_name', 'email', 'phone',
        'is_verified', 'rating', 'created_at', 'profile_picture_url'
      )
      .whereRaw(whereUuid('caregiver_id'), [id])
      .first();
  },

  async create(data) {
    await db(TABLE).insert(data);
    // data.caregiver_id is a raw expression, so we need the uuid string to re-fetch
    // Caller should pass the uuid string separately or we find by email
    if (data.email) {
      return db(TABLE)
        .select(db.raw(fromBin('caregiver_id')), 'first_name', 'last_name', 'email', 'phone',
          'is_verified', 'rating', 'created_at', 'profile_picture_url')
        .where({ email: data.email })
        .first();
    }
    return null;
  },

  async update(id, data) {
    await db(TABLE).whereRaw(whereUuid('caregiver_id'), [id]).update(data);
    return this.findById(id);
  },

  /**
   * Get certifications for a caregiver.
   * Joins caregiverCertification → certification for cert details.
   */
  async getCertifications(caregiverId) {
    return db('caregiverCertification as cc')
      .join('certification as c', function () {
        this.on(db.raw('cc.certification_id = c.certification_id'));
      })
      .whereRaw(whereUuid('cc.caregiver_id'), [caregiverId])
      .select(
        db.raw(fromBin('cc.caregiver_certification_id', 'caregiver_certification_id')),
        db.raw(fromBin('cc.certification_id', 'certification_id')),
        'cc.certificate_number',
        'cc.issued_date', 'cc.expiration_date',
        'cc.verification_status', 'cc.document_url', 'cc.created_at',
        'c.certification_name', 'c.issuing_authority', 'c.description'
      );
  },

  async addCertification(data) {
    await db('caregiverCertification').insert(data);
    // Re-fetch by certification_id
    return db('caregiverCertification')
      .select(
        db.raw(fromBin('caregiver_certification_id')),
        db.raw(fromBin('caregiver_id')),
        db.raw(fromBin('certification_id')),
        'certificate_number', 'issued_date', 'expiration_date',
        'verification_status', 'document_url', 'created_at'
      )
      .whereRaw('caregiver_certification_id = ?', [data.caregiver_certification_id])
      .first();
  },

  async removeCertification(caregiverId, certId) {
    return db('caregiverCertification')
      .whereRaw(whereUuid('caregiver_id'), [caregiverId])
      .andWhereRaw(whereUuid('caregiver_certification_id'), [certId])
      .del();
  },

  /**
   * Search for verified caregivers.
   * Simplified from old schema — no separate profiles table, no availability table.
   */
  async search({ lat, lon, page = 1, limit = 20 } = {}) {
    const query = db(TABLE).where('is_verified', true);

    const selectFields = [
      db.raw(fromBin('caregiver_id')),
      'first_name', 'last_name', 'email', 'phone',
      'rating', 'profile_picture_url',
    ];

    query.select(selectFields).orderBy('rating', 'desc');

    const offset = (page - 1) * limit;
    const data = await query.limit(limit).offset(offset);
    return data;
  },
};

module.exports = CaregiverModel;
