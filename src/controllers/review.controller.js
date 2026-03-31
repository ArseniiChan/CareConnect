const ReviewModel = require('../models/review.model');
const CaregiverModel = require('../models/caregiver.model');
const AppointmentModel = require('../models/appointment.model');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { buildPaginationResponse } = require('../utils/pagination');
const db = require('../config/database');

/**
 * POST /reviews — Create a review after a completed appointment.
 *
 * Authorization rules:
 * 1. The appointment must be in 'completed' status.
 * 2. Only the care receiver who BOOKED the appointment can review it.
 * 3. Only one review per appointment (no double-reviewing).
 *
 * The review is FOR the caregiver (reviewee_id = caregiver's users.id),
 * written BY the care receiver (reviewer_id = care receiver's users.id).
 *
 * IMPORTANT ID RESOLUTION:
 * appointments.caregiver_id → caregiver_profiles.id (NOT users.id)
 * appointments.care_receiver_id → care_receiver_profiles.id (NOT users.id)
 * reviews.reviewer_id → users.id
 * reviews.reviewee_id → users.id
 *
 * So we need to resolve profile IDs → user IDs before inserting.
 */
const create = catchAsync(async (req, res) => {
  const { appointmentId, overallRating, punctuality, professionalism, skillLevel, comment } = req.body;

  // 1. Find the appointment
  const appointment = await AppointmentModel.findById(appointmentId);
  if (!appointment) throw ApiError.notFound('Appointment not found');

  // 2. Must be completed
  if (appointment.status !== 'completed') {
    throw ApiError.badRequest(
      `Can only review completed appointments. This appointment is currently '${appointment.status}'.`
    );
  }

  // 3. Verify the caller is the care receiver who booked this appointment
  const receiverProfile = await db('care_receiver_profiles')
    .where({ user_id: req.user.id })
    .first();

  if (!receiverProfile || receiverProfile.id !== appointment.care_receiver_id) {
    throw ApiError.forbidden(
      'Only the care receiver who booked this appointment can leave a review'
    );
  }

  // 4. Check for existing review (one per appointment)
  const existing = await ReviewModel.findByAppointmentId(appointmentId);
  if (existing) throw ApiError.conflict('A review already exists for this appointment');

  // 5. Resolve caregiver_profiles.id → users.id for the reviewee
  const caregiverProfile = await db('caregiver_profiles')
    .where({ id: appointment.caregiver_id })
    .select('user_id')
    .first();

  if (!caregiverProfile) {
    throw ApiError.internal('Caregiver profile not found for this appointment');
  }

  // 6. Create the review
  const review = await ReviewModel.create({
    appointment_id: appointmentId,
    reviewer_id: req.user.id,                  // users.id of the care receiver
    reviewee_id: caregiverProfile.user_id,     // users.id of the caregiver (NOT profile ID)
    overall_rating: overallRating,
    punctuality,
    professionalism,
    skill_level: skillLevel,
    comment,
  });

  // 7. Recalculate the caregiver's average rating and total reviews
  await CaregiverModel.updateRating(appointment.caregiver_id);

  res.status(201).json({ status: 201, data: review });
});

const getById = catchAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid review ID');

  const review = await ReviewModel.findById(id);
  if (!review) throw ApiError.notFound('Review not found');
  res.json({ status: 200, data: review });
});

const update = catchAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid review ID');

  const review = await ReviewModel.findById(id);
  if (!review) throw ApiError.notFound('Review not found');

  // Only the author can edit their review
  if (review.reviewer_id !== req.user.id) throw ApiError.forbidden();

  // 48-hour edit window
  const hoursSinceCreation = (Date.now() - new Date(review.created_at).getTime()) / (1000 * 60 * 60);
  if (hoursSinceCreation > 48) {
    throw ApiError.badRequest('Reviews can only be edited within 48 hours of creation');
  }

  const updated = await ReviewModel.update(id, req.body);
  res.json({ status: 200, data: updated });
});

const remove = catchAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid review ID');

  const review = await ReviewModel.findById(id);
  if (!review) throw ApiError.notFound('Review not found');

  if (review.reviewer_id !== req.user.id && req.user.role !== 'admin') {
    throw ApiError.forbidden();
  }

  await ReviewModel.delete(id);
  res.status(204).send();
});

/**
 * GET /reviews/caregiver/:id — List all reviews for a specific caregiver.
 * Also available at GET /caregivers/:id/reviews (wired in caregiver.routes.js).
 */
const listForCaregiver = catchAsync(async (req, res) => {
  const caregiverId = parseInt(req.params.id, 10);
  if (isNaN(caregiverId)) throw ApiError.badRequest('Invalid caregiver ID');

  const profile = await db('caregiver_profiles').where({ id: caregiverId }).first();
  if (!profile) throw ApiError.notFound('Caregiver not found');

  const { page, limit } = req.query;
  const parsedPage = parseInt(page, 10) || 1;
  const parsedLimit = parseInt(limit, 10) || 20;

  const { data, total } = await ReviewModel.listForUser(profile.user_id, {
    page: parsedPage,
    limit: parsedLimit,
  });

  res.json({ status: 200, ...buildPaginationResponse(data, total, parsedPage, parsedLimit) });
});

module.exports = { create, getById, update, remove, listForCaregiver };
