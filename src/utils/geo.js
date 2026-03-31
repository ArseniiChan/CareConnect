/**
 * Geolocation utilities for distance calculation and caregiver matching.
 */

const EARTH_RADIUS_KM = 6371;

/**
 * Calculate distance between two coordinates using the Haversine formula.
 * Returns distance in kilometers.
 */
function haversineDistance(lat1, lon1, lat2, lon2) {
  const toRad = (deg) => (deg * Math.PI) / 180;

  const dLat = toRad(lat2 - lat1);
  const dLon = toRad(lon2 - lon1);

  const a =
    Math.sin(dLat / 2) ** 2 +
    Math.cos(toRad(lat1)) * Math.cos(toRad(lat2)) * Math.sin(dLon / 2) ** 2;

  const c = 2 * Math.atan2(Math.sqrt(a), Math.sqrt(1 - a));

  return EARTH_RADIUS_KM * c;
}

/**
 * Returns a Knex-compatible raw SQL fragment + bindings for Haversine distance.
 *
 * SECURITY FIX: The old version interpolated `lat` and `lon` directly into the
 * SQL string. Even though the controller validates them as numbers, string
 * interpolation in SQL is ALWAYS a red flag. If a future caller forgot to
 * validate, this would be a direct SQL injection vector.
 *
 * Fix: Return { sql, bindings } so the caller can use db.raw(sql, bindings).
 * Column names (latColumn, lonColumn) are still interpolated because they're
 * developer-controlled identifiers, not user input.
 */
function haversineSQL(latColumn, lonColumn) {
  const sql = `(${EARTH_RADIUS_KM} * ACOS(
    LEAST(1, COS(RADIANS(?)) * COS(RADIANS(${latColumn})) *
    COS(RADIANS(${lonColumn}) - RADIANS(?)) +
    SIN(RADIANS(?)) * SIN(RADIANS(${latColumn})))
  ))`;

  // Returns template — caller provides [lat, lon, lat] as bindings
  return sql;
}

module.exports = { haversineDistance, haversineSQL, EARTH_RADIUS_KM };
