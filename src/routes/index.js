const { Router } = require('express');

const router = Router();

/**
 * API routes — adapted for Joshua's schema.
 *
 * REMOVED routes (no backing tables):
 * - /reviews     → no reviews table
 * - /conversations → no conversations table (messages are per-appointment)
 * - /notifications → no notifications table
 *
 * Messages are now accessed via /appointments/:id/messages (nested under appointments).
 */

router.use('/auth', require('./auth.routes'));
router.use('/users', require('./user.routes'));
router.use('/caregivers', require('./caregiver.routes'));
router.use('/appointments', require('./appointment.routes'));
router.use('/addresses', require('./address.routes'));
router.use('/messages', require('./message.routes'));
router.use('/admin', require('./admin.routes'));

module.exports = router;
