const AppointmentService = require('../services/appointment.service');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { buildPaginationResponse, parsePaginationParams } = require('../utils/pagination');

/**
 * Parse and validate :id route param.
 * Every controller method needs this — DRY it into a helper.
 */
function parseId(params) {
  const id = parseInt(params.id, 10);
  if (isNaN(id)) throw ApiError.badRequest('Invalid appointment ID');
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
  const id = parseId(req.params);
  const appointment = await AppointmentService.getById(id);
  res.json({ status: 200, data: appointment });
});

const accept = catchAsync(async (req, res) => {
  const id = parseId(req.params);
  const appointment = await AppointmentService.accept(id, req.user.id);
  res.json({ status: 200, data: appointment, message: 'Appointment accepted' });
});

const decline = catchAsync(async (req, res) => {
  const id = parseId(req.params);
  const result = await AppointmentService.decline(id, req.user.id);
  res.json({ status: 200, ...result });
});

const start = catchAsync(async (req, res) => {
  const id = parseId(req.params);
  const appointment = await AppointmentService.start(id, req.user.id);
  res.json({ status: 200, data: appointment, message: 'Caregiver checked in — appointment started' });
});

const complete = catchAsync(async (req, res) => {
  const id = parseId(req.params);
  const appointment = await AppointmentService.complete(id, req.user.id);
  res.json({ status: 200, data: appointment, message: 'Appointment completed' });
});

const cancel = catchAsync(async (req, res) => {
  const id = parseId(req.params);
  const appointment = await AppointmentService.cancel(
    id, req.user.id, req.body.cancellationReason
  );
  res.json({ status: 200, data: appointment, message: 'Appointment cancelled' });
});

const noShow = catchAsync(async (req, res) => {
  const id = parseId(req.params);
  const appointment = await AppointmentService.noShow(id, req.user.id);
  res.json({ status: 200, data: appointment, message: 'Appointment marked as no-show' });
});

const getTasks = catchAsync(async (req, res) => {
  const id = parseId(req.params);
  const tasks = await AppointmentService.getTasks(id);
  res.json({ status: 200, data: tasks });
});

const addTask = catchAsync(async (req, res) => {
  const id = parseId(req.params);
  const task = await AppointmentService.addTask(id, req.body);
  res.status(201).json({ status: 201, data: task });
});

const toggleTask = catchAsync(async (req, res) => {
  const taskId = parseInt(req.params.taskId, 10);
  if (isNaN(taskId)) throw ApiError.badRequest('Invalid task ID');
  const task = await AppointmentService.toggleTask(taskId, req.body.isCompleted);
  res.json({ status: 200, data: task });
});

module.exports = { create, list, getById, accept, decline, start, complete, cancel, noShow, getTasks, addTask, toggleTask };
