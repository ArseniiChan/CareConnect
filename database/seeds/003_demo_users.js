const bcrypt = require('bcryptjs');
const { v4: uuidv4 } = require('uuid');

/**
 * Demo users seed — adapted for Joshua's TiDB schema.
 *
 * Creates:
 * - 1 admin user (users table only)
 * - 2 caregiver users (users + caregiver + caregiverCertification)
 * - 1 care receiver user (users + careReceiver + address)
 *
 * KEY CHANGE: user_id = caregiver_id = care_receiver_id (same UUID).
 * All IDs are binary(16) via uuid_to_bin().
 */
exports.seed = async function (knex) {
  // Clear tables in correct order (respect FK constraints)
  await knex('message').del();
  await knex('appointment').del();
  await knex('caregiverCertification').del();
  await knex('address').del();
  await knex('caregiver').del();
  await knex('careReceiver').del();
  await knex('users').del();

  const hash = await bcrypt.hash('Password123!', 12);

  // Generate UUIDs
  const adminId = uuidv4();
  const caregiver1Id = uuidv4();
  const caregiver2Id = uuidv4();
  const receiverId = uuidv4();

  // ── Users (auth table) ──────────────────────────────
  await knex('users').insert([
    {
      user_id: knex.raw('uuid_to_bin(?)', [adminId]),
      email: 'admin@careconnect.com',
      password_hash: hash,
      role: 'admin',
    },
    {
      user_id: knex.raw('uuid_to_bin(?)', [caregiver1Id]),
      email: 'maria.garcia@example.com',
      password_hash: hash,
      role: 'caregiver',
    },
    {
      user_id: knex.raw('uuid_to_bin(?)', [caregiver2Id]),
      email: 'james.wilson@example.com',
      password_hash: hash,
      role: 'caregiver',
    },
    {
      user_id: knex.raw('uuid_to_bin(?)', [receiverId]),
      email: 'dorothy.chen@example.com',
      password_hash: hash,
      role: 'care_receiver',
    },
  ]);

  // ── Caregiver profiles (same UUID as user_id) ──────
  await knex('caregiver').insert([
    {
      caregiver_id: knex.raw('uuid_to_bin(?)', [caregiver1Id]),
      first_name: 'Maria',
      last_name: 'Garcia',
      email: 'maria.garcia@example.com',
      phone: '212-555-0101',
      is_verified: true,
      rating: 4.85,
    },
    {
      caregiver_id: knex.raw('uuid_to_bin(?)', [caregiver2Id]),
      first_name: 'James',
      last_name: 'Wilson',
      email: 'james.wilson@example.com',
      phone: '212-555-0102',
      is_verified: true,
      rating: 4.92,
    },
  ]);

  // ── Care receiver profile (same UUID as user_id) ───
  await knex('careReceiver').insert({
    care_receiver_id: knex.raw('uuid_to_bin(?)', [receiverId]),
    first_name: 'Dorothy',
    last_name: 'Chen',
    birthday: '1948-03-15',
    sex: 'female',
  });

  // ── Link certifications ─────────────────────────────
  // Get certification IDs from the certifications seed
  const certs = await knex('certification')
    .select(knex.raw('bin_to_uuid(certification_id) as certification_id'), 'certification_name');

  const cnaId = certs.find(c => c.certification_name.includes('Certified Nursing'))?.certification_id;
  const rnaId = certs.find(c => c.certification_name.includes('Registered Nursing'))?.certification_id;
  const cprId = certs.find(c => c.certification_name.includes('CPR'))?.certification_id;

  if (cnaId) {
    await knex('caregiverCertification').insert([
      {
        caregiver_certification_id: knex.raw('uuid_to_bin(?)', [uuidv4()]),
        caregiver_id: knex.raw('uuid_to_bin(?)', [caregiver1Id]),
        certification_id: knex.raw('uuid_to_bin(?)', [cnaId]),
        certificate_number: 'CNA-NY-2018-4521',
        issued_date: '2018-06-01',
        expiration_date: '2027-06-01',
        verification_status: 'verified',
      },
    ]);
  }

  if (cprId) {
    await knex('caregiverCertification').insert([
      {
        caregiver_certification_id: knex.raw('uuid_to_bin(?)', [uuidv4()]),
        caregiver_id: knex.raw('uuid_to_bin(?)', [caregiver1Id]),
        certification_id: knex.raw('uuid_to_bin(?)', [cprId]),
        issued_date: '2024-01-15',
        expiration_date: '2026-01-15',
        verification_status: 'verified',
      },
    ]);
  }

  if (rnaId) {
    await knex('caregiverCertification').insert([
      {
        caregiver_certification_id: knex.raw('uuid_to_bin(?)', [uuidv4()]),
        caregiver_id: knex.raw('uuid_to_bin(?)', [caregiver2Id]),
        certification_id: knex.raw('uuid_to_bin(?)', [rnaId]),
        certificate_number: 'RNA-NY-2014-8832',
        issued_date: '2014-09-01',
        expiration_date: '2026-09-01',
        verification_status: 'verified',
      },
    ]);
  }

  // ── Address for care receiver ───────────────────────
  await knex('address').insert({
    address_id: knex.raw('uuid_to_bin(?)', [uuidv4()]),
    care_receiver_id: knex.raw('uuid_to_bin(?)', [receiverId]),
    nickname: 'home',
    address_line1: '123 Main St',
    address_line2: 'Apt 4B',
    city: 'New York',
    state: 'NY',
    zip_code: '10001',
    latitude: 40.7484,
    longitude: -73.9967,
    is_primary: true,
  });
};
