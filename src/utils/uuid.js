/**
 * UUID binary(16) utilities for TiDB Cloud.
 *
 * WHY THIS EXISTS:
 * Joshua's TiDB schema uses binary(16) primary keys with uuid_to_bin(uuid()) defaults.
 * Every ID in the database is a 16-byte binary blob, not a readable string.
 *
 * The problem: Knex returns binary(16) as Node.js Buffer objects, and you can't
 * use a plain UUID string in WHERE clauses against binary columns. We need to
 * convert back and forth at the application boundary.
 *
 * HOW IT WORKS:
 * - INSERT: Generate a UUID v4 → pass to TiDB's uuid_to_bin() for storage
 * - SELECT: Use bin_to_uuid() in column selects so Knex returns strings
 * - WHERE:  Use uuid_to_bin(?) to compare against binary columns
 *
 * WHY USE TiDB's BUILT-IN FUNCTIONS (not Node.js Buffer manipulation):
 * TiDB's uuid_to_bin()/bin_to_uuid() handle the byte ordering correctly and
 * are optimized for the storage engine. Doing it in Node.js would require
 * matching TiDB's exact byte layout, which is fragile.
 */

const { v4: uuidv4 } = require('uuid');

/**
 * Generate a new UUID v4 string.
 * Use this when creating new records.
 *
 * @returns {string} e.g. "550e8400-e29b-41d4-a716-446655440000"
 */
function generate() {
  return uuidv4();
}

/**
 * Build a Knex db.raw() expression to convert a UUID string to binary(16) for storage.
 * Use in INSERT and WHERE clauses.
 *
 * @param {object} db - Knex instance
 * @param {string} uuid - UUID string to convert
 * @returns {object} Knex raw expression
 *
 * @example
 * // INSERT
 * await db('caregiver').insert({ caregiver_id: toBin(db, newId), ... })
 *
 * // WHERE
 * await db('caregiver').where('caregiver_id', toBin(db, id)).first()
 */
function toBin(db, uuid) {
  return db.raw('uuid_to_bin(?)', [uuid]);
}

/**
 * Build a SQL fragment that converts a binary(16) column to a UUID string in SELECT.
 * Returns "bin_to_uuid(column) as alias" for use in .select(db.raw(...)).
 *
 * @param {string} column - The binary(16) column name (e.g. 'caregiver_id')
 * @param {string} [alias] - Optional alias for the output (defaults to column name)
 * @returns {string} SQL fragment
 *
 * @example
 * db('caregiver').select(db.raw(fromBin('caregiver_id')), 'first_name', 'last_name')
 * // → SELECT bin_to_uuid(caregiver_id) as caregiver_id, first_name, last_name
 */
function fromBin(column, alias) {
  return `bin_to_uuid(${column}) as ${alias || column}`;
}

/**
 * Build a SQL WHERE fragment for matching a UUID against a binary(16) column.
 * Returns { sql, bindings } for use with .whereRaw().
 *
 * @param {string} column - The binary(16) column name
 * @returns {string} SQL fragment with ? placeholder
 *
 * @example
 * db('caregiver').whereRaw(whereUuid('caregiver_id'), [id])
 */
function whereUuid(column) {
  return `${column} = uuid_to_bin(?)`;
}

/**
 * Convert a raw Buffer/binary value from a query result to a UUID string.
 * Use this as a fallback when bin_to_uuid() wasn't used in the SELECT.
 *
 * @param {Buffer} buffer - 16-byte buffer from the database
 * @returns {string} UUID string
 */
function bufferToUuid(buffer) {
  if (!buffer || !Buffer.isBuffer(buffer)) return buffer;
  const hex = buffer.toString('hex');
  return [
    hex.slice(0, 8),
    hex.slice(8, 12),
    hex.slice(12, 16),
    hex.slice(16, 20),
    hex.slice(20, 32),
  ].join('-');
}

/**
 * Recursively convert all Buffer values in a query result row to UUID strings.
 * Useful as a post-processing step for complex joins where you can't
 * alias every binary column with bin_to_uuid().
 *
 * @param {object} row - A single result row from Knex
 * @returns {object} Row with Buffers converted to UUID strings
 */
function convertBuffers(row) {
  if (!row || typeof row !== 'object') return row;
  const result = {};
  for (const [key, value] of Object.entries(row)) {
    result[key] = Buffer.isBuffer(value) ? bufferToUuid(value) : value;
  }
  return result;
}

module.exports = {
  generate,
  toBin,
  fromBin,
  whereUuid,
  bufferToUuid,
  convertBuffers,
};
