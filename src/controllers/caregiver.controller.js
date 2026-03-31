const CaregiverModel = require('../models/caregiver.model');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');

/**
 * Verify the caller owns this caregiver profile.
 *
 * SECURITY FIX: The old addCertification, removeCertification, and setAvailability
 * endpoints had no ownership check. Any authenticated user could:
 *   POST /caregivers/5/certifications  → add fake certs to someone else's profile
 *   PUT  /caregivers/5/availability    → wipe someone else's availability
 *   DELETE /caregivers/5/certifications/3 → remove someone else's cert
 *
 * Fix: Verify that the :id in the URL matches the caller's caregiver profile.
 */
async function requireOwnership(req) {
  const caregiverId = parseInt(req.params.id, 10);
  if (isNaN(caregiverId)) throw ApiError.badRequest('Invalid caregiver ID');

  const profile = await CaregiverModel.findByUserId(req.user.id);
  if (!profile || profile.id !== caregiverId) {
    throw ApiError.forbidden('You can only modify your own caregiver profile');
  }
  return profile;
}

const search = catchAsync(async (req, res) => {
  const { lat, lon, serviceLevel, dayOfWeek, page, limit } = req.query;

  const parsedLat = lat !== undefined ? parseFloat(lat) : undefined;
  const parsedLon = lon !== undefined ? parseFloat(lon) : undefined;
  const parsedDay = dayOfWeek !== undefined ? parseInt(dayOfWeek, 10) : undefined;

  if (parsedLat !== undefined && isNaN(parsedLat)) throw ApiError.badRequest('Invalid latitude');
  if (parsedLon !== undefined && isNaN(parsedLon)) throw ApiError.badRequest('Invalid longitude');
  if (parsedDay !== undefined && (isNaN(parsedDay) || parsedDay < 0 || parsedDay > 6)) {
    throw ApiError.badRequest('dayOfWeek must be 0-6 (Sunday=0, Saturday=6)');
  }

  const results = await CaregiverModel.search({
    lat: parsedLat, lon: parsedLon,
    serviceLevel, dayOfWeek: parsedDay,
    page: parseInt(page, 10) || 1, limit: parseInt(limit, 10) || 20,
  });
  res.json({ status: 200, data: results });
});

const getById = catchAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid caregiver ID');

  const caregiver = await CaregiverModel.findById(id);
  if (!caregiver) throw ApiError.notFound('Caregiver not found');

  const certifications = await CaregiverModel.getCertifications(caregiver.id);
  res.json({ status: 200, data: { ...caregiver, certifications } });
});

const addCertification = catchAsync(async (req, res) => {
  const profile = await requireOwnership(req);
  const cert = await CaregiverModel.addCertification({
    caregiver_id: profile.id,
    ...req.body,
  });
  res.status(201).json({ status: 201, data: cert });
});

const removeCertification = catchAsync(async (req, res) => {
  const profile = await requireOwnership(req);
  const certId = parseInt(req.params.certId, 10);
  if (isNaN(certId)) throw ApiError.badRequest('Invalid certification ID');

  await CaregiverModel.removeCertification(profile.id, certId);
  res.status(204).send();
});

const getAvailability = catchAsync(async (req, res) => {
  const id = parseInt(req.params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid caregiver ID');

  const availability = await CaregiverModel.getAvailability(id);
  res.json({ status: 200, data: availability });
});

const setAvailability = catchAsync(async (req, res) => {
  const profile = await requireOwnership(req);

  if (!req.body.slots || !Array.isArray(req.body.slots)) {
    throw ApiError.badRequest('slots must be an array');
  }

  const availability = await CaregiverModel.setAvailability(profile.id, req.body.slots);
  res.json({ status: 200, data: availability });
});

module.exports = { search, getById, addCertification, removeCertification, getAvailability, setAvailability };
