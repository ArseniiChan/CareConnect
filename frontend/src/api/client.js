// Canonical API client for CareConnect.
// See PROJECT_PLAN.md §13.0 for the response envelope contract.

const BASE = import.meta.env.VITE_API_URL;

if (!BASE) {
  // Surfacing this loud rather than failing on every fetch with a confusing error.
  console.error(
    'VITE_API_URL is not set. Create frontend/.env with:\n' +
    'VITE_API_URL=https://careconnect-backend-production-65cc.up.railway.app'
  );
}

/**
 * Single fetch wrapper. Attaches the access token from localStorage if present.
 * Throws Error(message) on any non-2xx so callers can try/catch in one place.
 */
export async function api(path, opts = {}) {
  const token = localStorage.getItem('token');
  const res = await fetch(`${BASE}${path}`, {
    ...opts,
    headers: {
      'Content-Type': 'application/json',
      ...(token && { Authorization: `Bearer ${token}` }),
      ...opts.headers,
    },
  });
  const json = await res.json().catch(() => ({}));
  if (!res.ok) {
    const msg = json.message || json.error || res.statusText || 'Request failed';
    throw new Error(msg);
  }
  return json;
}

// ── Auth ─────────────────────────────────────────────────────
export const auth = {
  login: (email, password) =>
    api('/api/v1/auth/login', {
      method: 'POST',
      body: JSON.stringify({ email, password }),
    }),
  register: (data) =>
    api('/api/v1/auth/register', {
      method: 'POST',
      body: JSON.stringify(data),
    }),
  me: () => api('/api/v1/auth/me'),
};

// ── Addresses ────────────────────────────────────────────────
export const addresses = {
  list: () => api('/api/v1/addresses'),
  create: (body) =>
    api('/api/v1/addresses', { method: 'POST', body: JSON.stringify(body) }),
};

// ── Appointments ─────────────────────────────────────────────
export const appointments = {
  // Care receiver: their own bookings.
  // Caregiver (no status filter): their assignments.
  // Caregiver (?status=requested): the open-request discovery feed.
  // Optional `geo` { lat, lng, radiusMiles } adds the distance filter +
  // distance column for the caregiver discovery feed.
  list: (status, geo) => {
    const params = new URLSearchParams();
    if (status) params.set('status', status);
    if (geo && typeof geo.lat === 'number' && typeof geo.lng === 'number') {
      params.set('lat', String(geo.lat));
      params.set('lng', String(geo.lng));
      if (typeof geo.radiusMiles === 'number') {
        params.set('radiusMiles', String(geo.radiusMiles));
      }
    }
    const qs = params.toString();
    return api(`/api/v1/appointments${qs ? `?${qs}` : ''}`);
  },
  get: (id) => api(`/api/v1/appointments/${id}`),
  create: (body) =>
    api('/api/v1/appointments', {
      method: 'POST',
      body: JSON.stringify(body),
    }),
  accept: (id) =>
    api(`/api/v1/appointments/${id}/accept`, { method: 'POST' }),
  decline: (id) =>
    api(`/api/v1/appointments/${id}/decline`, { method: 'POST' }),
  complete: (id) =>
    api(`/api/v1/appointments/${id}/complete`, { method: 'POST' }),
  cancel: (id, cancellationReason) =>
    api(`/api/v1/appointments/${id}/cancel`, {
      method: 'POST',
      body: JSON.stringify({ cancellationReason }),
    }),
};

// ── Messages ─────────────────────────────────────────────────
export const messages = {
  list: (appointmentId) =>
    api(`/api/v1/appointments/${appointmentId}/messages`),
  send: (appointmentId, content) =>
    api(`/api/v1/appointments/${appointmentId}/messages`, {
      method: 'POST',
      body: JSON.stringify({ content }),
    }),
};

// ── Geocoding ────────────────────────────────────────────────
// Returns { lat, lng } or null when nothing matched. Used by the caregiver
// service-area capture and any future address autocomplete.
export const geocode = {
  lookup: (q) => api(`/api/v1/geocode?q=${encodeURIComponent(q)}`),
};

// ── Admin ─────────────────────────────────────────────────────
export const admin = {
  dashboard: () => api('/api/v1/admin/dashboard'),
  appointmentStats: (period = '30d') =>
    api(`/api/v1/admin/appointments/stats?period=${encodeURIComponent(period)}`),
  revenue: (periodDays = 30) =>
    api(`/api/v1/admin/revenue?period=${periodDays}`),
  // CSV export needs the auth header set, so we use the same fetch wrapper
  // and trigger a browser download from the resulting blob. The backend
  // sends `Content-Disposition: attachment` so the file lands in Downloads.
  exportRevenueCsv: async (periodDays = 30) => {
    const token = localStorage.getItem('token');
    const res = await fetch(
      `${BASE}/api/v1/admin/revenue/export.csv?period=${periodDays}`,
      { headers: token ? { Authorization: `Bearer ${token}` } : {} }
    );
    if (!res.ok) throw new Error(`Export failed: ${res.status}`);
    const blob = await res.blob();
    const url = URL.createObjectURL(blob);
    const a = document.createElement('a');
    a.href = url;
    a.download = `careconnect-revenue-${periodDays}d.csv`;
    document.body.appendChild(a);
    a.click();
    a.remove();
    URL.revokeObjectURL(url);
  },
};
