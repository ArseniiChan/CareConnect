const { Router } = require('express');
const caregiverController = require('../controllers/caregiver.controller');
const authenticate = require('../middleware/auth');

const router = Router();

/**
 * Caregiver routes — adapted for Joshua's schema.
 *
 * REMOVED:
 * - /:id/reviews → no reviews table
 * - /:id/availability → no caregiver_availability table
 */

router.get('/', authenticate, caregiverController.search);
router.get('/:id', authenticate, caregiverController.getById);
router.post('/:id/certifications', authenticate, caregiverController.addCertification);
router.delete('/:id/certifications/:certId', authenticate, caregiverController.removeCertification);

module.exports = router;
