const { Router } = require('express');
const appointmentController = require('../controllers/appointment.controller');
const messageController = require('../controllers/message.controller');
const authenticate = require('../middleware/auth');
const validate = require('../middleware/validate');
const appointmentValidation = require('../validations/appointment.validation');

const router = Router();

/**
 * Appointment routes — adapted for Joshua's schema.
 *
 * Changes:
 * - Removed /start and /no-show (no in_progress or no_show status)
 * - Removed /tasks (no appointment_tasks table)
 * - Added nested /messages routes (messages are per-appointment)
 * - :id is now a UUID string, not an integer
 */

// CRUD
router.post('/', authenticate, validate(appointmentValidation.createAppointment), appointmentController.create);
router.get('/', authenticate, validate(appointmentValidation.listAppointments), appointmentController.list);
router.get('/:id', authenticate, appointmentController.getById);

// Lifecycle state transitions
router.post('/:id/accept', authenticate, appointmentController.accept);
router.post('/:id/decline', authenticate, appointmentController.decline);
router.post('/:id/complete', authenticate, appointmentController.complete);
router.post('/:id/cancel', authenticate, appointmentController.cancel);

// Messages (nested under appointment)
router.get('/:id/messages', authenticate, messageController.getMessages);
router.post('/:id/messages', authenticate, messageController.sendMessage);

module.exports = router;
