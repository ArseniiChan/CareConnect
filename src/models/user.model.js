const db = require('../config/database');
const { toBin, fromBin, whereUuid } = require('../utils/uuid');

/**
 * User model — authentication table (added for Joshua's schema).
 *
 * The users table stores login credentials and role. The user_id is
 * the SAME UUID as caregiver_id or care_receiver_id, so there's no
 * need for a join to resolve "which user owns this profile."
 *
 * Table: users
 * Columns: user_id binary(16) PK, email, password_hash, role, is_active, created_at
 */

const TABLE = 'users';

const SELECT_FIELDS = [
  db.raw(fromBin('user_id')),
  'email',
  'password_hash',
  'role',
  'is_active',
  'created_at',
];

const UserModel = {
  async findById(id) {
    return db(TABLE)
      .select(SELECT_FIELDS)
      .whereRaw(whereUuid('user_id'), [id])
      .first();
  },

  async findByEmail(email) {
    return db(TABLE)
      .select(SELECT_FIELDS)
      .where({ email })
      .first();
  },

  async create(userData) {
    // user_id should already be a toBin() expression
    await db(TABLE).insert(userData);
    // Return the created user (re-fetch to get bin_to_uuid conversion)
    return this.findByEmail(userData.email);
  },

  async update(id, data) {
    await db(TABLE).whereRaw(whereUuid('user_id'), [id]).update(data);
    return this.findById(id);
  },

  async deactivate(id) {
    return db(TABLE).whereRaw(whereUuid('user_id'), [id]).update({ is_active: false });
  },

  async list({ page = 1, limit = 20, role } = {}) {
    const query = db(TABLE).where({ is_active: true });

    if (role) {
      query.where({ role });
    }

    const offset = (page - 1) * limit;
    const [data, [{ total }]] = await Promise.all([
      query.clone()
        .select(db.raw(fromBin('user_id')), 'email', 'role', 'is_active', 'created_at')
        .limit(limit).offset(offset).orderBy('created_at', 'desc'),
      query.clone().count('* as total'),
    ]);

    return { data, total };
  },
};

module.exports = UserModel;
