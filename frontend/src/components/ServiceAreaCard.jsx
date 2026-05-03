// ServiceAreaCard — caregiver-only widget that captures the caregiver's
// service area (a ZIP plus a radius), geocodes it, and persists to
// localStorage. Surfaces above the open-requests feed on HomePage.
//
// Why localStorage and not the database (yet):
//   The caregiver table doesn't have lat/lng/zip columns. Adding them
//   requires a migration Joshua has to run on TiDB. For demo timing we keep
//   the data client-side; behavior is identical, and we can promote to the
//   DB after the demo without changing any of the consumer code (HomePage,
//   API client) — only this component swaps storage.
//
// Older-user / a11y choices:
//   - Plain language ("Your service area" not "Geographic preferences")
//   - Single ZIP input + radius dropdown — no map, no autocomplete
//   - Always shows the current setting + a "Change" button (no hidden state)
//   - aria-live error region

import { useState } from 'react';
import { MapPin, Pencil } from 'lucide-react';
import { geocode } from '../api/client';

const STORAGE_KEY = 'careconnect.serviceArea';
const DEFAULT_RADIUS = 25;
const RADIUS_OPTIONS = [5, 10, 25, 50, 100];

/** Read once at render — caller passes the value back to the hook on save. */
export function loadServiceArea() {
  try {
    const raw = localStorage.getItem(STORAGE_KEY);
    if (!raw) return null;
    const parsed = JSON.parse(raw);
    if (typeof parsed?.lat !== 'number' || typeof parsed?.lng !== 'number') return null;
    return {
      zip: parsed.zip || '',
      lat: parsed.lat,
      lng: parsed.lng,
      radiusMiles: parsed.radiusMiles || DEFAULT_RADIUS,
    };
  } catch {
    return null;
  }
}

function saveServiceArea(area) {
  localStorage.setItem(STORAGE_KEY, JSON.stringify(area));
}

function clearServiceArea() {
  localStorage.removeItem(STORAGE_KEY);
}

export default function ServiceAreaCard({ area, onChange }) {
  const [editing, setEditing] = useState(!area);
  const [zip, setZip] = useState(area?.zip || '');
  const [radius, setRadius] = useState(area?.radiusMiles || DEFAULT_RADIUS);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  async function handleSave(e) {
    e.preventDefault();
    setError('');
    const z = zip.trim();
    if (!/^\d{5}$/.test(z)) {
      setError('Please enter a 5-digit ZIP code.');
      return;
    }
    setSubmitting(true);
    try {
      // Bias the lookup to a ZIP code by appending "USA" — Nominatim returns
      // better matches when the country is explicit.
      const res = await geocode.lookup(`${z}, USA`);
      if (!res.data) {
        setError(`We could not find ZIP ${z}. Try a different one.`);
        return;
      }
      const next = { zip: z, lat: res.data.lat, lng: res.data.lng, radiusMiles: radius };
      saveServiceArea(next);
      setEditing(false);
      onChange?.(next);
    } catch (err) {
      setError(err.message || 'Could not look up that ZIP. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  function handleClear() {
    clearServiceArea();
    setZip('');
    setRadius(DEFAULT_RADIUS);
    setEditing(true);
    onChange?.(null);
  }

  // ── Display mode (already saved) ────────────────────────────
  if (!editing && area) {
    return (
      <div className="mb-6 flex flex-col gap-3 rounded-xl border border-[var(--color-primary-100)] bg-[var(--color-primary-50)] p-5 sm:flex-row sm:items-center sm:justify-between">
        <div className="flex items-start gap-3">
          <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-[var(--color-primary-700)]">
            <MapPin size={18} strokeWidth={2.2} aria-hidden="true" />
          </span>
          <div>
            <p className="text-base font-semibold text-[var(--color-neutral-900)]">
              Showing requests within {area.radiusMiles} miles of {area.zip}
            </p>
            <p className="mt-0.5 text-sm text-[var(--color-neutral-600)]">
              Stored locally on this device.
            </p>
          </div>
        </div>
        <button
          type="button"
          onClick={() => setEditing(true)}
          className="btn btn-secondary shrink-0"
        >
          <Pencil size={16} strokeWidth={2.2} aria-hidden="true" />
          Change
        </button>
      </div>
    );
  }

  // ── Edit mode ───────────────────────────────────────────────
  return (
    <form
      onSubmit={handleSave}
      className="mb-6 rounded-xl border border-[var(--color-border)] bg-white p-5"
    >
      <div className="mb-4 flex items-start gap-3">
        <span className="mt-0.5 inline-flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-50)] text-[var(--color-primary-700)]">
          <MapPin size={18} strokeWidth={2.2} aria-hidden="true" />
        </span>
        <div>
          <h2 className="text-lg font-bold text-[var(--color-neutral-900)]">
            Your service area
          </h2>
          <p className="mt-0.5 text-base text-[var(--color-neutral-600)]">
            Only open requests near you appear below.
          </p>
        </div>
      </div>

      <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
        <div>
          <label htmlFor="sa-zip" className="field-label">Your ZIP code</label>
          <input
            id="sa-zip"
            type="text"
            inputMode="numeric"
            autoComplete="postal-code"
            maxLength={5}
            value={zip}
            onChange={(e) => setZip(e.target.value.replace(/\D/g, ''))}
            className="input"
            placeholder="10001"
            required
          />
        </div>
        <div>
          <label htmlFor="sa-radius" className="field-label">Maximum distance</label>
          <select
            id="sa-radius"
            value={radius}
            onChange={(e) => setRadius(Number(e.target.value))}
            className="input"
          >
            {RADIUS_OPTIONS.map((r) => (
              <option key={r} value={r}>{r} miles</option>
            ))}
          </select>
        </div>
      </div>

      <div role="alert" aria-live="polite" className={error ? 'mt-4' : ''}>
        {error && <p className="alert alert-error">{error}</p>}
      </div>

      <div className="mt-5 flex flex-wrap gap-3">
        <button type="submit" disabled={submitting} className="btn btn-primary">
          {submitting ? 'Saving…' : (area ? 'Save changes' : 'Save service area')}
        </button>
        {area && (
          <>
            <button
              type="button"
              onClick={() => { setEditing(false); setZip(area.zip); setRadius(area.radiusMiles); }}
              className="btn btn-secondary"
            >
              Cancel
            </button>
            <button
              type="button"
              onClick={handleClear}
              className="inline-flex h-12 items-center rounded-md px-3 text-base font-semibold text-[var(--color-danger-600)] hover:underline"
            >
              Clear
            </button>
          </>
        )}
      </div>
    </form>
  );
}
