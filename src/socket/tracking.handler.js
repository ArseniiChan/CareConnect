const db = require('../config/database');

function trackingHandler(io, socket) {
  // Only caregivers emit location updates
  socket.on('update_location', async ({ appointmentId, latitude, longitude }) => {
    if (socket.userRole !== 'caregiver') return;

    // Validate coordinates to prevent garbage data in DB
    if (typeof latitude !== 'number' || typeof longitude !== 'number' ||
        latitude < -90 || latitude > 90 || longitude < -180 || longitude > 180) {
      return socket.emit('error', { message: 'Invalid coordinates' });
    }

    try {
      const profile = await db('caregiver_profiles').where({ user_id: socket.userId }).first();
      if (!profile) return;

      // Verify this caregiver is actually assigned to this appointment
      const appointment = await db('appointments')
        .where({ id: appointmentId, caregiver_id: profile.id, status: 'in_progress' })
        .first();
      if (!appointment) {
        return socket.emit('error', { message: 'Not assigned to this appointment or appointment not in progress' });
      }

      await db('caregiver_locations').insert({
        caregiver_id: profile.id,
        latitude,
        longitude,
      });

      io.to(`appointment:${appointmentId}`).emit('location_update', {
        caregiverId: profile.id,
        latitude,
        longitude,
        timestamp: new Date().toISOString(),
      });
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });

  // SECURITY FIX: The old code let any authenticated user join any appointment
  // tracking room. An attacker could track the real-time location of any caregiver
  // by joining appointment:123 — a privacy/safety nightmare for a healthcare app.
  //
  // Fix: Verify the user is a participant of the appointment.
  socket.on('track_appointment', async ({ appointmentId }) => {
    try {
      const appointment = await db('appointments').where({ id: appointmentId }).first();
      if (!appointment) {
        return socket.emit('error', { message: 'Appointment not found' });
      }

      // Check if this user is the care receiver
      const receiverProfile = await db('care_receiver_profiles')
        .where({ user_id: socket.userId })
        .first();
      const isReceiver = receiverProfile && receiverProfile.id === appointment.care_receiver_id;

      // Check if this user is the assigned caregiver
      const caregiverProfile = await db('caregiver_profiles')
        .where({ user_id: socket.userId })
        .first();
      const isCaregiver = caregiverProfile && caregiverProfile.id === appointment.caregiver_id;

      if (!isReceiver && !isCaregiver && socket.userRole !== 'admin') {
        return socket.emit('error', { message: 'Not authorized to track this appointment' });
      }

      socket.join(`appointment:${appointmentId}`);
    } catch (err) {
      socket.emit('error', { message: err.message });
    }
  });
}

module.exports = trackingHandler;
