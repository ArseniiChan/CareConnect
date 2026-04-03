const CaregiverModel = require('../models/caregiver.model');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { generate: generateUuid } = require('../utils/uuid');
const db = require('../config/database');

const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

/**
 * Verify the caller owns this caregiver profile.
 * SIMPLIFIED: caregiver_id === user_id in the new schema.
 */
function requireOwnership(req) {
  const caregiverId = req.params.id;
  if (!caregiverId || !UUID_REGEX.test(caregiverId)) {
    throw ApiError.badRequest('Invalid caregiver ID');
  }

  // In the new schema, caregiver_id === user_id
  if (req.user.id !== caregiverId) {
    throw ApiError.forbidden('You can only modify your own caregiver profile');
  }
  return caregiverId;
}

const search = catchAsync(async (req, res) => {
  const { lat, lon, page, limit } = req.query;

  const parsedLat = lat !== undefined ? parseFloat(lat) : undefined;
  const parsedLon = lon !== undefined ? parseFloat(lon) : undefined;

  if (parsedLat !== undefined && isNaN(parsedLat)) throw ApiError.badRequest('Invalid latitude');
  if (parsedLon !== undefined && isNaN(parsedLon)) throw ApiError.badRequest('Invalid longitude');

  const results = await CaregiverModel.search({
    lat: parsedLat, lon: parsedLon,
    page: parseInt(page, 10) || 1, limit: parseInt(limit, 10) || 20,
  });
  res.json({ status: 200, data: results });
});

const getById = catchAsync(async (req, res) => {
  const id = req.params.id;
  if (!id || !UUID_REGEX.test(id)) throw ApiError.badRequest('Invalid caregiver ID');

  const caregiver = await CaregiverModel.findById(id);
  if (!caregiver) throw ApiError.notFound('Caregiver not found');

  const certifications = await CaregiverModel.getCertifications(id);
  res.json({ status: 200, data: { ...caregiver, certifications } });
});

const addCertification = catchAsync(async (req, res) => {
  const caregiverId = requireOwnership(req);
  const certId = generateUuid();

  const cert = await CaregiverModel.addCertification({
    caregiver_certification_id: db.raw('uuid_to_bin(?)', [certId]),
    caregiver_id: db.raw('uuid_to_bin(?)', [caregiverId]),
    certification_id: db.raw('uuid_to_bin(?)', [req.body.certificationId]),
    certificate_number: req.body.certificateNumber || null,
    issued_date: req.body.issuedDate || null,
    expiration_date: req.body.expirationDate || null,
    verification_status: 'pending',
    document_url: req.body.documentUrl || null,
  });
  res.status(201).json({ status: 201, data: cert });
});

const removeCertification = catchAsync(async (req, res) => {
  const caregiverId = requireOwnership(req);
  const certId = req.params.certId;
  if (!certId || !UUID_REGEX.test(certId)) throw ApiError.badRequest('Invalid certification ID');

  await CaregiverModel.removeCertification(caregiverId, certId);
  res.status(204).send();
});

module.exports = { search, getById, addCertification, removeCertification };
