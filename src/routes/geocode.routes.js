// /api/v1/geocode — thin proxy in front of the geocoding service.
//
// Exists because the browser cannot call Nominatim directly while satisfying
// their usage policy (we have to set a real User-Agent header, which fetch()
// in browsers refuses to override). Centralizing here also means our cache +
// rate-limit apply to ALL geocode lookups, including caregiver locations
// captured client-side.

const { Router } = require('express');
const authenticate = require('../middleware/auth');
const catchAsync = require('../utils/catchAsync');
const ApiError = require('../utils/ApiError');
const { geocode } = require('../services/geocoding.service');

const router = Router();

router.get(
  '/',
  authenticate, // require auth — geocoding is a paid resource for callers
  catchAsync(async (req, res) => {
    const q = (req.query.q || '').toString().trim();
    if (!q || q.length > 200) {
      throw ApiError.badRequest('Query (q) is required and must be under 200 chars');
    }
    const coords = await geocode(q);
    if (!coords) {
      // 200 with null is friendlier than 404 for "no result" — the frontend
      // shows a polite "we couldn't find that, try a city + state" message.
      return res.json({ status: 200, data: null });
    }
    res.json({ status: 200, data: { lat: coords.lat, lng: coords.lng, query: q } });
  })
);

module.exports = router;
