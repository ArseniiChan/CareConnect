/**
 * ADD USERS TABLE FOR AUTHENTICATION
 *
 * Joshua's TiDB schema has NO users/auth table. The caregiver table has email
 * but no password_hash, and careReceiver has no email at all.
 *
 * Without a users table, there's no way to:
 * 1. Store password hashes (login)
 * 2. Issue JWTs with a unified user identity
 * 3. Implement role-based access control
 *
 * DESIGN DECISION:
 * The user_id in this table is THE SAME UUID as the caregiver_id or care_receiver_id.
 * This means req.user.id IS the caregiver_id or care_receiver_id directly.
 *
 *   Register as caregiver:
 *     1. Generate UUID
 *     2. INSERT into `users` with that UUID
 *     3. INSERT into `caregiver` with that SAME UUID as caregiver_id
 *
 *   Register as care_receiver:
 *     1. Generate UUID
 *     2. INSERT into `users` with that UUID
 *     3. INSERT into `careReceiver` with that SAME UUID as care_receiver_id
 *
 * This eliminates the old profile-table indirection where we had to resolve
 * care_receiver_profiles.id → users.id every time we needed to send a notification.
 * Now appointment.care_receiver_id === users.user_id directly.
 *
 * NOTE: This migration must be run on Joshua's TiDB Cloud database.
 * Arsenii — discuss with Joshua before running.
 */

exports.up = function (knex) {
  return knex.schema.createTable('users', (table) => {
    table.specificType('user_id', 'binary(16)').primary();
    table.string('email', 255).unique().notNullable();
    table.string('password_hash', 255).notNullable();
    table.enu('role', ['caregiver', 'care_receiver', 'admin']).notNullable();
    table.boolean('is_active').defaultTo(true);
    table.datetime('created_at').defaultTo(knex.fn.now());
  });
};

exports.down = function (knex) {
  return knex.schema.dropTableIfExists('users');
};
