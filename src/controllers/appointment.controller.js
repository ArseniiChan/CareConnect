const AppointmentService = require('../services/appointment.service');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { buildPaginationResponse, parsePaginationParams } = require('../utils/pagination');

/**
 * Validate UUID format for :id route param.
 * UUIDs are 36 chars: 8-4-4-4-12 hex digits separated by hyphens.
 */
const UUID_REGEX = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;

function parseUuidParam(params) {
  const id = params.id;
  if (!id || !UUID_REGEX.test(id)) {
    throw ApiError.badRequest('Invalid appointment ID — must be a valid UUID');
  }
  return id;
}

const create = catchAsync(async (req, res) => {
  const appointment = await AppointmentService.create(req.user.id, req.body);
  res.status(201).json({ status: 201, data: appointment });
});

const list = catchAsync(async (req, res) => {
  const { page, limit } = parsePaginationParams(req.query);
  const { data, total } = await AppointmentService.list(req.user.id, req.user.role, {
    ...req.query, page, limit,
  });
  res.json({ status: 200, ...buildPaginationResponse(data, total, page, limit) });
});

const getById = catchAsync(async (req, res) => {
  const id = parseUuidParam(req.params);
  const appointment = await AppointmentService.getById(id);
  res.json({ status: 200, data: appointment });
});

const accept = catchAsync(async (req, res) => {
  const id = parseUuidParam(req.params);
  const appointment = await AppointmentService.accept(id, req.user.id);
  res.json({ status: 200, data: appointment, message: 'Appointment accepted' });
});

const decline = catchAsync(async (req, res) => {
  const id = parseUuidParam(req.params);
  const result = await AppointmentService.decline(id, req.user.id);
  res.json({ status: 200, ...result });
});

const complete = catchAsync(async (req, res) => {
  const id = parseUuidParam(req.params);
  const appointment = await AppointmentService.complete(id, req.user.id);
  res.json({ status: 200, data: appointment, message: 'Appointment completed' });
});

const cancel = catchAsync(async (req, res) => {
  const id = parseUuidParam(req.params);
  const appointment = await AppointmentService.cancel(
    id, req.user.id, req.body.cancellationReason
  );
  res.json({ status: 200, data: appointment, message: 'Appointment cancelled' });
});

module.exports = { create, list, getById, accept, decline, complete, cancel };
