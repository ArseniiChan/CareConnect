// Geocoding service — turns a free-form address (or ZIP) into {lat, lng}.
//
// Uses OpenStreetMap Nominatim because it's free and doesn't require an API
// key. Trade-offs we accept for a school project:
//   - 1 request/second hard cap (their usage policy). We enforce it locally.
//   - No SLAs. If Nominatim is slow, geocoding is slow. We fail open: if a
//     lookup fails, the address is saved without coordinates and the radius
//     filter just skips that row.
//   - Coverage isn't perfect for partial inputs. We give it the most specific
//     query we can build (line + city + state + ZIP).
//
// Cache: in-memory LRU keyed on the normalized query string. Survives until
// the process restarts. For a small demo workload this is plenty; if we
// outgrow it, drop in Redis with the same interface.

const NOMINATIM_URL = 'https://nominatim.openstreetmap.org/search';
// Nominatim's policy requires a real User-Agent identifying the app.
const USER_AGENT = 'CareConnect/1.0 (https://github.com/ArseniiChan/CareConnect)';

const CACHE_MAX = 500;
const cache = new Map();

let lastCallAt = 0;
const MIN_INTERVAL_MS = 1100; // 1s policy + small buffer

function normalize(q) {
  return q.trim().toLowerCase().replace(/\s+/g, ' ');
}

function cacheGet(key) {
  if (!cache.has(key)) return undefined;
  const value = cache.get(key);
  // Promote to most-recent on access
  cache.delete(key);
  cache.set(key, value);
  return value;
}

function cacheSet(key, value) {
  if (cache.size >= CACHE_MAX) {
    // Evict oldest
    const oldest = cache.keys().next().value;
    cache.delete(oldest);
  }
  cache.set(key, value);
}

async function rateLimit() {
  const now = Date.now();
  const wait = lastCallAt + MIN_INTERVAL_MS - now;
  if (wait > 0) await new Promise((r) => setTimeout(r, wait));
  lastCallAt = Date.now();
}

/**
 * Geocode a query string. Returns { lat, lng } or null on failure.
 * Both successful and null results are cached so we don't hammer Nominatim
 * with repeated lookups for the same bad input.
 */
async function geocode(query) {
  if (!query || typeof query !== 'string') return null;
  const key = normalize(query);
  if (!key) return null;

  const cached = cacheGet(key);
  if (cached !== undefined) return cached;

  await rateLimit();

  try {
    const url = new URL(NOMINATIM_URL);
    url.searchParams.set('q', query);
    url.searchParams.set('format', 'json');
    url.searchParams.set('limit', '1');
    url.searchParams.set('countrycodes', 'us'); // demo is US-only

    const res = await fetch(url, {
      headers: { 'User-Agent': USER_AGENT, Accept: 'application/json' },
      // Don't let a slow Nominatim hang the request indefinitely
      signal: AbortSignal.timeout(5000),
    });
    if (!res.ok) {
      cacheSet(key, null);
      return null;
    }
    const arr = await res.json();
    if (!Array.isArray(arr) || arr.length === 0) {
      cacheSet(key, null);
      return null;
    }
    const hit = arr[0];
    const lat = parseFloat(hit.lat);
    const lng = parseFloat(hit.lon);
    if (Number.isNaN(lat) || Number.isNaN(lng)) {
      cacheSet(key, null);
      return null;
    }
    const result = { lat, lng };
    cacheSet(key, result);
    return result;
  } catch (err) {
    // Any error -> fail open. Log once per unique query so we can debug
    // without flooding logs on a slow network.
    console.warn(`geocode("${query}") failed: ${err.message}`);
    cacheSet(key, null);
    return null;
  }
}

/**
 * Convenience: build a Nominatim-friendly query from an address record.
 */
function buildAddressQuery({ address_line1, addressLine1, city, state, zip_code, zipCode }) {
  const line = address_line1 || addressLine1 || '';
  const zip = zip_code || zipCode || '';
  const parts = [line, city, state, zip].filter(Boolean);
  return parts.join(', ');
}

module.exports = { geocode, buildAddressQuery };
