// AppointmentsMap — Leaflet map showing the caregiver's service area + a
// marker per open request within range. Used as an alternate view to the
// list on the caregiver home dashboard.
//
// Why Leaflet + free OSM tiles instead of Mapbox/Google: the project
// rubric values free cloud / no-paid-services. OSM tiles are free for
// reasonable use as long as we attribute properly; Leaflet is the
// standard front-end library for them. No API key needed.
//
// Accessibility note: the map is a *secondary* view, not the only way to
// see open requests. Keyboard users and screen reader users get the list
// view by default; the toggle to switch to map is keyboard-reachable.

import { useEffect, useMemo } from 'react';
import { MapContainer, Marker, Popup, TileLayer, Circle, useMap } from 'react-leaflet';
import L from 'leaflet';
import 'leaflet/dist/leaflet.css';

// Leaflet's default marker icons reference assets that Vite doesn't bundle
// from node_modules by default. Inline an SVG-based icon so we don't need
// to copy PNG files into public/.
const APPT_ICON = L.divIcon({
  className: 'appt-marker',
  html: `
    <span style="
      display:flex; align-items:center; justify-content:center;
      width:32px; height:32px; border-radius:50%;
      background:hsl(205, 67%, 45%); color:white;
      box-shadow:0 2px 6px rgba(0,0,0,0.25);
      border:2px solid white;
      font-size:16px; font-weight:700;
    ">⚕</span>
  `,
  iconSize: [32, 32],
  iconAnchor: [16, 16],
  popupAnchor: [0, -16],
});

const HOME_ICON = L.divIcon({
  className: 'home-marker',
  html: `
    <span style="
      display:flex; align-items:center; justify-content:center;
      width:28px; height:28px; border-radius:50%;
      background:hsl(173, 56%, 39%); color:white;
      box-shadow:0 2px 6px rgba(0,0,0,0.25);
      border:2px solid white;
    ">●</span>
  `,
  iconSize: [28, 28],
  iconAnchor: [14, 14],
});

// Re-center the map when the center prop changes (e.g. user updates ZIP).
function Recenter({ center }) {
  const map = useMap();
  useEffect(() => {
    if (center) map.setView(center, map.getZoom());
  }, [center, map]);
  return null;
}

export default function AppointmentsMap({ center, radiusMiles, appointments, onSelect }) {
  const center2 = center || [40.7484, -73.9967]; // fallback: midtown Manhattan

  // Filter to appointments that have coords. Anything without lat/lng can't
  // be plotted (likely an address that wasn't geocoded yet).
  const plottable = useMemo(
    () => (appointments || []).filter((a) =>
      typeof a.latitude === 'number' && typeof a.longitude === 'number'
    ),
    [appointments]
  );

  return (
    <div
      role="region"
      aria-label="Map of nearby open requests"
      className="overflow-hidden rounded-xl border border-[var(--color-border)]"
      style={{ height: 480 }}
    >
      <MapContainer
        center={center2}
        zoom={12}
        scrollWheelZoom={false}
        style={{ height: '100%', width: '100%' }}
      >
        <Recenter center={center2} />
        <TileLayer
          attribution='&copy; <a href="https://www.openstreetmap.org/copyright">OpenStreetMap</a> contributors'
          url="https://tile.openstreetmap.org/{z}/{x}/{y}.png"
        />

        {/* Service area ring */}
        {center && typeof radiusMiles === 'number' && (
          <Circle
            center={center}
            radius={radiusMiles * 1609.34}
            pathOptions={{
              color: 'hsl(205, 67%, 45%)',
              weight: 2,
              fillColor: 'hsl(205, 67%, 45%)',
              fillOpacity: 0.08,
            }}
          />
        )}

        {/* Caregiver's home pin */}
        {center && (
          <Marker position={center} icon={HOME_ICON}>
            <Popup>You are here.</Popup>
          </Marker>
        )}

        {/* Open request pins */}
        {plottable.map((a) => (
          <Marker
            key={a.appointment_id}
            position={[a.latitude, a.longitude]}
            icon={APPT_ICON}
            eventHandlers={onSelect ? { click: () => onSelect(a) } : undefined}
          >
            <Popup>
              <div className="text-sm">
                <div className="font-semibold">
                  {a.receiver_first_name} {a.receiver_last_name}
                </div>
                <div className="mt-1 text-[var(--color-neutral-600)]">
                  {a.address_line1}<br />
                  {a.city}, {a.state} {a.zip_code}
                </div>
                {typeof a.distance_miles === 'number' && (
                  <div className="mt-1 font-semibold text-[var(--color-primary-700)]">
                    {a.distance_miles.toFixed(1)} mi away
                  </div>
                )}
              </div>
            </Popup>
          </Marker>
        ))}
      </MapContainer>
    </div>
  );
}
