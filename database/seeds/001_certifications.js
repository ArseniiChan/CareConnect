const { v4: uuidv4 } = require('uuid');

/**
 * Seed certifications for Joshua's `certification` table.
 *
 * Table: certification
 * Columns: certification_id binary(16), certification_name, issuing_authority, description
 */
exports.seed = async function (knex) {
  // Delete child rows first (FK constraint: caregiverCertification.certification_id → certification)
  // Otherwise the certification delete fails with a foreign-key error.
  // We also clear caregiverCertification fully here so 003_demo_users.js starts from a clean slate
  // and can reinsert links idempotently.
  await knex('caregiverCertification').del();
  await knex('certification').del();

  const certs = [
    { certification_name: 'Certified Nursing Assistant', issuing_authority: 'State Board of Nursing', description: 'Provides basic patient care under the supervision of nursing staff.' },
    { certification_name: 'Registered Nursing Assistant', issuing_authority: 'State Board of Nursing', description: 'Provides advanced nursing assistance with medication administration capabilities.' },
    { certification_name: 'Nurse Practitioner', issuing_authority: 'ANCC / AANP', description: 'Advanced practice registered nurse with prescriptive authority.' },
    { certification_name: 'Home Health Aide', issuing_authority: 'State Department of Health', description: 'Provides personal care services in the home setting.' },
    { certification_name: 'CPR/First Aid Certification', issuing_authority: 'American Red Cross', description: 'Basic life support and first aid certification.' },
  ];

  const rows = certs.map((cert) => ({
    certification_id: knex.raw('uuid_to_bin(?)', [uuidv4()]),
    ...cert,
  }));

  await knex('certification').insert(rows);
};
