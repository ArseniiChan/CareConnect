const db = require('../config/database');
const catchAsync = require('../utils/catchAsync');

/**
 * Admin controller — adapted for Joshua's schema.
 *
 * Changes:
 * - No payments table → revenue stats removed
 * - Table name: appointments → appointment
 * - Status values: 'requested','scheduled','completed','cancelled'
 * - users table uses user_id not id
 */

const getDashboard = catchAsync(async (req, res) => {
  const [users, appointments] = await Promise.all([
    db('users').count('* as total').first(),
    db('appointment').select(
      db.raw('COUNT(*) as total'),
      db.raw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed"),
      db.raw("SUM(CASE WHEN status = 'requested' THEN 1 ELSE 0 END) as requested"),
      db.raw("SUM(CASE WHEN status = 'scheduled' THEN 1 ELSE 0 END) as scheduled"),
      db.raw("SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled")
    ).first(),
  ]);

  res.json({
    status: 200,
    data: {
      users: { total: users.total },
      appointments,
    },
  });
});

const getAppointmentStats = catchAsync(async (req, res) => {
  const { period = '30d' } = req.query;
  const days = parseInt(period, 10) || 30;

  const stats = await db('appointment')
    .select(
      db.raw('DATE(created_at) as date'),
      db.raw('COUNT(*) as count'),
      db.raw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed")
    )
    .where('created_at', '>=', db.raw('DATE_SUB(NOW(), INTERVAL ? DAY)', [days]))
    .groupByRaw('DATE(created_at)')
    .orderBy('date');

  res.json({ status: 200, data: stats });
});

module.exports = { getDashboard, getAppointmentStats };
