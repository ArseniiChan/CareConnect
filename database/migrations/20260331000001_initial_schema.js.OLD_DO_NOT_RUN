/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.up = async function (knex) {
  // ── USERS & AUTH ──────────────────────────────────
  await knex.schema.createTable('users', (t) => {
    t.increments('id').primary();
    t.string('email', 255).notNullable().unique();
    t.string('password_hash', 255).notNullable();
    t.string('first_name', 100).notNullable();
    t.string('last_name', 100).notNullable();
    t.string('phone', 20);
    t.string('avatar_url', 500);
    t.enu('role', ['care_receiver', 'caregiver', 'admin']).notNullable();
    t.boolean('is_active').defaultTo(true);
    t.boolean('email_verified').defaultTo(false);
    t.timestamps(true, true);
    t.index('email');
    t.index('role');
  });

  // ── CAREGIVER PROFILES ────────────────────────────
  await knex.schema.createTable('caregiver_profiles', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().unique()
      .references('id').inTable('users').onDelete('CASCADE');
    t.text('bio');
    t.decimal('hourly_rate', 10, 2);
    t.integer('years_experience').defaultTo(0);
    t.boolean('is_verified').defaultTo(false);
    t.enu('background_check_status', ['pending', 'approved', 'rejected', 'expired']).defaultTo('pending');
    t.date('background_check_date');
    t.decimal('average_rating', 3, 2).defaultTo(0);
    t.integer('total_reviews').defaultTo(0);
    t.integer('total_appointments').defaultTo(0);
    t.integer('service_radius_km').defaultTo(25);
    t.index('is_verified');
    t.index('average_rating');
  });

  // ── CERTIFICATIONS ────────────────────────────────
  await knex.schema.createTable('certifications', (t) => {
    t.increments('id').primary();
    t.string('name', 100).notNullable().unique();
    t.string('abbreviation', 20);
    t.text('description');
    t.enu('level', ['CNA', 'RNA', 'NP', 'other']).notNullable();
  });

  await knex.schema.createTable('caregiver_certifications', (t) => {
    t.increments('id').primary();
    t.integer('caregiver_id').unsigned().notNullable()
      .references('id').inTable('caregiver_profiles').onDelete('CASCADE');
    t.integer('certification_id').unsigned().notNullable()
      .references('id').inTable('certifications');
    t.string('license_number', 100);
    t.date('issued_date');
    t.date('expiry_date');
    t.string('document_url', 500);
    t.boolean('verified').defaultTo(false);
    t.unique(['caregiver_id', 'certification_id']);
  });

  // ── CAREGIVER AVAILABILITY ────────────────────────
  await knex.schema.createTable('caregiver_availability', (t) => {
    t.increments('id').primary();
    t.integer('caregiver_id').unsigned().notNullable()
      .references('id').inTable('caregiver_profiles').onDelete('CASCADE');
    t.tinyint('day_of_week').notNullable(); // 0=Sun, 6=Sat
    t.time('start_time').notNullable();
    t.time('end_time').notNullable();
    t.boolean('is_recurring').defaultTo(true);
    t.date('specific_date');
    t.index(['caregiver_id', 'day_of_week']);
  });

  // ── CARE RECEIVER PROFILES ────────────────────────
  await knex.schema.createTable('care_receiver_profiles', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable().unique()
      .references('id').inTable('users').onDelete('CASCADE');
    t.date('date_of_birth');
    t.enu('sex', ['male', 'female', 'other', 'prefer_not_to_say']);
    t.string('emergency_contact_name', 200);
    t.string('emergency_contact_phone', 20);
    t.text('medical_notes');
  });

  await knex.schema.createTable('insurance_policies', (t) => {
    t.increments('id').primary();
    t.integer('care_receiver_id').unsigned().notNullable()
      .references('id').inTable('care_receiver_profiles').onDelete('CASCADE');
    t.string('provider_name', 200).notNullable();
    t.string('policy_number', 100);
    t.string('group_number', 100);
    t.string('coverage_type', 100);
    t.date('expiry_date');
  });

  // ── ADDRESSES ─────────────────────────────────────
  await knex.schema.createTable('addresses', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned()
      .references('id').inTable('users').onDelete('CASCADE');
    t.string('label', 50).defaultTo('home');
    t.string('street_address', 255).notNullable();
    t.string('apt_unit', 50);
    t.string('city', 100).notNullable();
    t.string('state', 50).notNullable();
    t.string('zip_code', 20).notNullable();
    t.decimal('latitude', 10, 8);
    t.decimal('longitude', 11, 8);
    t.boolean('is_default').defaultTo(false);
    t.index('user_id');
    t.index(['latitude', 'longitude']);
  });

  // ── SERVICE TYPES ─────────────────────────────────
  await knex.schema.createTable('service_types', (t) => {
    t.increments('id').primary();
    t.string('name', 100).notNullable();
    t.text('description');
    t.decimal('base_hourly_rate', 10, 2).notNullable();
    t.enu('required_certification_level', ['CNA', 'RNA', 'NP']).notNullable();
    t.boolean('is_active').defaultTo(true);
  });

  // ── APPOINTMENTS ──────────────────────────────────
  await knex.schema.createTable('appointments', (t) => {
    t.increments('id').primary();
    t.integer('care_receiver_id').unsigned().notNullable()
      .references('id').inTable('care_receiver_profiles');
    t.integer('caregiver_id').unsigned()
      .references('id').inTable('caregiver_profiles');
    t.integer('service_type_id').unsigned().notNullable()
      .references('id').inTable('service_types');
    t.integer('address_id').unsigned().notNullable()
      .references('id').inTable('addresses');
    t.enu('status', ['pending', 'accepted', 'in_progress', 'completed', 'cancelled', 'no_show']).defaultTo('pending');
    t.dateTime('scheduled_start').notNullable();
    t.dateTime('scheduled_end').notNullable();
    t.dateTime('actual_start');
    t.dateTime('actual_end');
    t.text('notes');
    t.text('cancellation_reason');
    t.timestamps(true, true);
    t.index(['caregiver_id', 'status']);
    t.index(['care_receiver_id', 'status']);
    t.index(['scheduled_start', 'scheduled_end']);
  });

  await knex.schema.createTable('appointment_tasks', (t) => {
    t.increments('id').primary();
    t.integer('appointment_id').unsigned().notNullable()
      .references('id').inTable('appointments').onDelete('CASCADE');
    t.string('description', 500).notNullable();
    t.boolean('is_completed').defaultTo(false);
    t.dateTime('completed_at');
    t.integer('sort_order').defaultTo(0);
  });

  // ── REVIEWS ───────────────────────────────────────
  await knex.schema.createTable('reviews', (t) => {
    t.increments('id').primary();
    t.integer('appointment_id').unsigned().notNullable().unique()
      .references('id').inTable('appointments');
    t.integer('reviewer_id').unsigned().notNullable()
      .references('id').inTable('users');
    t.integer('reviewee_id').unsigned().notNullable()
      .references('id').inTable('users');
    t.tinyint('overall_rating').notNullable();
    t.tinyint('punctuality');
    t.tinyint('professionalism');
    t.tinyint('skill_level');
    t.text('comment');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('reviewee_id');
  });

  // ── CHAT / MESSAGING ─────────────────────────────
  await knex.schema.createTable('conversations', (t) => {
    t.increments('id').primary();
    t.integer('appointment_id').unsigned()
      .references('id').inTable('appointments').onDelete('SET NULL');
    t.timestamp('created_at').defaultTo(knex.fn.now());
  });

  await knex.schema.createTable('conversation_participants', (t) => {
    t.integer('conversation_id').unsigned().notNullable()
      .references('id').inTable('conversations').onDelete('CASCADE');
    t.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.timestamp('joined_at').defaultTo(knex.fn.now());
    t.primary(['conversation_id', 'user_id']);
  });

  await knex.schema.createTable('messages', (t) => {
    t.bigIncrements('id').primary();
    t.integer('conversation_id').unsigned().notNullable()
      .references('id').inTable('conversations').onDelete('CASCADE');
    t.integer('sender_id').unsigned().notNullable()
      .references('id').inTable('users');
    t.text('content').notNullable();
    t.enu('message_type', ['text', 'image', 'system']).defaultTo('text');
    t.boolean('is_read').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['conversation_id', 'created_at']);
  });

  // ── PAYMENTS ──────────────────────────────────────
  await knex.schema.createTable('payment_methods', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.enu('type', ['credit_card', 'debit_card', 'bank_account']).notNullable();
    t.string('last_four', 4);
    t.string('brand', 20);
    t.string('stripe_payment_method_id', 255);
    t.boolean('is_default').defaultTo(false);
  });

  await knex.schema.createTable('payments', (t) => {
    t.increments('id').primary();
    t.integer('appointment_id').unsigned().notNullable()
      .references('id').inTable('appointments');
    t.integer('payer_id').unsigned().notNullable()
      .references('id').inTable('users');
    t.integer('payee_id').unsigned().notNullable()
      .references('id').inTable('users');
    t.decimal('amount', 10, 2).notNullable();
    t.decimal('platform_fee', 10, 2).notNullable();
    t.decimal('caregiver_payout', 10, 2).notNullable();
    t.enu('status', ['pending', 'processing', 'completed', 'failed', 'refunded']).defaultTo('pending');
    t.string('stripe_payment_intent_id', 255);
    t.dateTime('paid_at');
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index('status');
    t.index('appointment_id');
  });

  // ── NOTIFICATIONS ─────────────────────────────────
  await knex.schema.createTable('notifications', (t) => {
    t.increments('id').primary();
    t.integer('user_id').unsigned().notNullable()
      .references('id').inTable('users').onDelete('CASCADE');
    t.enu('type', ['job_alert', 'appointment_update', 'message', 'review', 'payment', 'system']).notNullable();
    t.string('title', 255).notNullable();
    t.text('body');
    t.json('data');
    t.boolean('is_read').defaultTo(false);
    t.timestamp('created_at').defaultTo(knex.fn.now());
    t.index(['user_id', 'is_read']);
    t.index('created_at');
  });

  // ── CAREGIVER LOCATION TRACKING ───────────────────
  await knex.schema.createTable('caregiver_locations', (t) => {
    t.increments('id').primary();
    t.integer('caregiver_id').unsigned().notNullable()
      .references('id').inTable('caregiver_profiles').onDelete('CASCADE');
    t.decimal('latitude', 10, 8).notNullable();
    t.decimal('longitude', 11, 8).notNullable();
    t.timestamp('recorded_at').defaultTo(knex.fn.now());
    t.index(['caregiver_id', 'recorded_at']);
  });
};

/**
 * @param { import("knex").Knex } knex
 * @returns { Promise<void> }
 */
exports.down = async function (knex) {
  const tables = [
    'caregiver_locations', 'notifications', 'payments', 'payment_methods',
    'messages', 'conversation_participants', 'conversations',
    'reviews', 'appointment_tasks', 'appointments',
    'service_types', 'addresses', 'insurance_policies',
    'care_receiver_profiles', 'caregiver_availability',
    'caregiver_certifications', 'certifications', 'caregiver_profiles', 'users',
  ];

  for (const table of tables) {
    await knex.schema.dropTableIfExists(table);
  }
};
