const { Router } = require('express');
const adminController = require('../controllers/admin.controller');
const authenticate = require('../middleware/auth');
const authorize = require('../middleware/authorize');

const router = Router();

router.use(authenticate, authorize('admin'));

router.get('/dashboard', adminController.getDashboard);
router.get('/appointments/stats', adminController.getAppointmentStats);
router.get('/revenue', adminController.getRevenueReport);
router.get('/revenue/export.csv', adminController.exportRevenueCsv);

module.exports = router;
