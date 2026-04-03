const db = require('../config/database');
const { toBin, fromBin, whereUuid } = require('../utils/uuid');

/**
 * CareReceiver model — maps to Joshua's `careReceiver` table.
 *
 * KEY CHANGE from old schema:
 * - Old: care_receiver_profiles table with user_id FK → users table
 * - New: careReceiver table IS the profile. care_receiver_id = user_id (same UUID)
 *
 * Table: careReceiver
 * Columns: care_receiver_id binary(16) PK, first_name, last_name, birthday, sex,
 *          profile_picture_url
 */

const TABLE = 'careReceiver';

const CareReceiverModel = {
  async findById(id) {
    return db(TABLE)
      .select(
        db.raw(fromBin('care_receiver_id')),
        'first_name', 'last_name', 'birthday', 'sex', 'profile_picture_url'
      )
      .whereRaw(whereUuid('care_receiver_id'), [id])
      .first();
  },

  async create(data) {
    await db(TABLE).insert(data);
    // Caller passes the UUID string for re-fetch
    return null; // Will be fetched by auth service after creation
  },

  async update(id, data) {
    await db(TABLE).whereRaw(whereUuid('care_receiver_id'), [id]).update(data);
    return this.findById(id);
  },

  /**
   * Get insurance policies for a care receiver.
   * Joshua's schema: insurance table with care_receiver_id FK.
   */
  async getInsurance(careReceiverId) {
    return db('insurance')
      .select(
        db.raw(fromBin('insurance_id')),
        db.raw(fromBin('care_receiver_id')),
        'provider_name', 'policy_number', 'group_number', 'plan_name',
        'subscriber_name', 'relationship_to_subscriber',
        'effective_date', 'expiration_date', 'phone_number', 'is_primary', 'created_at'
      )
      .whereRaw(whereUuid('care_receiver_id'), [careReceiverId]);
  },

  async addInsurance(data) {
    await db('insurance').insert(data);
    return db('insurance')
      .select(
        db.raw(fromBin('insurance_id')),
        db.raw(fromBin('care_receiver_id')),
        'provider_name', 'policy_number', 'group_number', 'plan_name',
        'subscriber_name', 'relationship_to_subscriber',
        'effective_date', 'expiration_date', 'phone_number', 'is_primary', 'created_at'
      )
      .whereRaw('insurance_id = ?', [data.insurance_id])
      .first();
  },

  async removeInsurance(careReceiverId, insuranceId) {
    return db('insurance')
      .whereRaw(whereUuid('care_receiver_id'), [careReceiverId])
      .andWhereRaw(whereUuid('insurance_id'), [insuranceId])
      .del();
  },

  /**
   * Get diagnoses for a care receiver.
   * Joshua's schema: diagnosis table (no PK — composite on care_receiver_id + diagnosis).
   */
  async getDiagnoses(careReceiverId) {
    return db('diagnosis')
      .select(
        db.raw(fromBin('care_receiver_id')),
        'diagnosis', 'prescriber', 'diagnosis_date'
      )
      .whereRaw(whereUuid('care_receiver_id'), [careReceiverId]);
  },

  /**
   * Get medications for a care receiver.
   */
  async getMedications(careReceiverId) {
    return db('medication')
      .select(
        db.raw(fromBin('medication_id')),
        db.raw(fromBin('care_receiver_id')),
        'drug_name', 'prescriber', 'dose'
      )
      .whereRaw(whereUuid('care_receiver_id'), [careReceiverId]);
  },
};

module.exports = CareReceiverModel;
