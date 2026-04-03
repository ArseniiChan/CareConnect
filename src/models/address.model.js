const db = require('../config/database');
const { toBin, fromBin, whereUuid } = require('../utils/uuid');

/**
 * Address model — maps to Joshua's `address` table.
 *
 * KEY CHANGES from old schema:
 * - Table name: addresses → address
 * - Owner field: user_id → care_receiver_id (addresses belong to care receivers only)
 * - Column renames:
 *   - label → nickname
 *   - street_address → address_line1
 *   - apt_unit → address_line2
 *   - is_default → is_primary
 * - IDs: auto-increment int → binary(16) UUID
 *
 * Table: address
 * Columns: address_id binary(16) PK, care_receiver_id binary(16),
 *          nickname, address_line1, address_line2, city, state, zip_code,
 *          latitude, longitude, is_primary, created_at
 */

const TABLE = 'address';

const SELECT_FIELDS = (prefix = '') => {
  const p = prefix ? `${prefix}.` : '';
  return [
    db.raw(fromBin(`${p}address_id`, 'address_id')),
    db.raw(fromBin(`${p}care_receiver_id`, 'care_receiver_id')),
    `${p}nickname`, `${p}address_line1`, `${p}address_line2`,
    `${p}city`, `${p}state`, `${p}zip_code`,
    `${p}latitude`, `${p}longitude`, `${p}is_primary`, `${p}created_at`,
  ];
};

const AddressModel = {
  async findById(id) {
    return db(TABLE)
      .select(SELECT_FIELDS())
      .whereRaw(whereUuid('address_id'), [id])
      .first();
  },

  /**
   * List addresses for a care receiver.
   * Note: userId === care_receiver_id in the new schema.
   */
  async listForUser(careReceiverId) {
    return db(TABLE)
      .select(SELECT_FIELDS())
      .whereRaw(whereUuid('care_receiver_id'), [careReceiverId])
      .orderBy('is_primary', 'desc');
  },

  async create(data) {
    // If this is set as primary, unset other primaries first
    if (data.is_primary) {
      await db(TABLE)
        .whereRaw(whereUuid('care_receiver_id'), [data._care_receiver_id_str])
        .update({ is_primary: false });
    }
    // Remove the helper string field before insert
    delete data._care_receiver_id_str;

    await db(TABLE).insert(data);
    return null; // Service layer re-fetches by known ID
  },

  async update(id, data) {
    if (data.is_primary) {
      const address = await this.findById(id);
      if (address) {
        await db(TABLE)
          .whereRaw(whereUuid('care_receiver_id'), [address.care_receiver_id])
          .update({ is_primary: false });
      }
    }
    await db(TABLE).whereRaw(whereUuid('address_id'), [id]).update(data);
    return this.findById(id);
  },

  async delete(id) {
    return db(TABLE).whereRaw(whereUuid('address_id'), [id]).del();
  },
};

module.exports = AddressModel;
