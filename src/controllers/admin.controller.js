const db = require('../config/database');
const catchAsync = require('../utils/catchAsync');

const getDashboard = catchAsync(async (req, res) => {
  const [users, appointments, revenue] = await Promise.all([
    db('users').count('* as total').first(),
    db('appointments').select(
      db.raw('COUNT(*) as total'),
      db.raw("SUM(CASE WHEN status = 'completed' THEN 1 ELSE 0 END) as completed"),
      db.raw("SUM(CASE WHEN status = 'pending' THEN 1 ELSE 0 END) as pending"),
      db.raw("SUM(CASE WHEN status = 'in_progress' THEN 1 ELSE 0 END) as in_progress"),
      db.raw("SUM(CASE WHEN status = 'cancelled' THEN 1 ELSE 0 END) as cancelled")
    ).first(),
    db('payments')
      .where({ status: 'completed' })
      .sum('platform_fee as total_revenue')
      .sum('amount as total_volume')
      .first(),
  ]);

  res.json({
    status: 200,
    data: {
      users: { total: users.total },
      appointments,
      revenue: {
        totalRevenue: revenue.total_revenue || 0,
        totalVolume: revenue.total_volume || 0,
      },
    },
  });
});

const getAppointmentStats = catchAsync(async (req, res) => {
  const { period = '30d' } = req.query;
  const days = parseInt(period, 10) || 30;

  // SECURITY FIX: The old code interpolated `days` directly into a db.raw() string:
  //   db.raw(`DATE_SUB(NOW(), INTERVAL ${days} DAY)`)
  // Even though parseInt makes `days` a number, this pattern is dangerous because:
  // 1. If someone later changes the parsing, the injection opens up.
  // 2. It teaches bad habits — always use parameterized queries.
  // Fix: Use ? placeholder so Knex sends it as a bound parameter.
  const stats = await db('appointments')
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
