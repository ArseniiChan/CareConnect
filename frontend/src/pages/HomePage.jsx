// HomePage — role-aware dashboard, the first screen after sign in.
//
// Care receiver: greeting + next appointment hero + book CTA + list.
// Caregiver: greeting + open requests (discovery feed) + my scheduled jobs.
//
// Design choices for elderly users:
//   - Greeting by first name — orientation, warm, not clinical
//   - Primary action ("Book Care", "Accept request") visually dominant
//   - Cards have larger tap zones (min 96px) with both hover and focus states
//   - Empty states use plain language + clear next step (Refactoring UI ch.18)
//   - Times shown in long format (e.g. "Friday, May 15 · 9:00 AM – 11:00 AM"),
//     never relative ("in 13 days") which is harder to parse cognitively
//   - Counterparty name larger than meta — hierarchy via size + weight + color

import { useEffect, useState } from 'react';
import { Link, useNavigate } from 'react-router-dom';
import { CalendarPlus, Search, MapPin, Clock, List, Map as MapIcon } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { appointments } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import ServiceAreaCard, { loadServiceArea } from '../components/ServiceAreaCard';
import AppointmentsMap from '../components/AppointmentsMap';

export default function HomePage() {
  const { user } = useAuth();
  if (!user) return null;
  return user.role === 'caregiver' ? <CaregiverHome /> : <CareReceiverHome />;
}

// ════════════════════════════════════════════════════════════
// CARE RECEIVER DASHBOARD
// ════════════════════════════════════════════════════════════
function CareReceiverHome() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    appointments.list()
      .then((res) => setItems(res.data || []))
      .catch((err) => setError(err.message));
  }, []);

  const upcoming = items?.filter((a) => a.status === 'requested' || a.status === 'scheduled') || [];
  const past = items?.filter((a) => a.status === 'completed' || a.status === 'cancelled') || [];

  return (
    <div>
      <Greeting name={user.firstName} subtitle="Here's your upcoming care." />

      {error && <p className="alert alert-error mb-6">{error}</p>}

      {/* Primary CTA — visually dominant. Refactoring UI: emphasis via
          size + color + weight + spacing combined. */}
      <div className="mb-8 flex flex-col items-start gap-3 rounded-xl border border-[var(--color-primary-100)] bg-gradient-to-br from-[var(--color-primary-50)] to-white p-6 sm:flex-row sm:items-center sm:justify-between">
        <div>
          <h2 className="text-xl font-bold text-[var(--color-neutral-900)]">
            Need care soon?
          </h2>
          <p className="mt-1 text-base text-[var(--color-neutral-600)]">
            Book a verified caregiver in under a minute.
          </p>
        </div>
        <Link to="/book" className="btn btn-primary btn-lg shrink-0">
          <CalendarPlus size={20} strokeWidth={2.2} aria-hidden="true" />
          Book Care
        </Link>
      </div>

      {/* Upcoming */}
      <Section title="Upcoming" count={upcoming.length}>
        {items === null && <Skeleton rows={2} />}
        {items && upcoming.length === 0 && (
          <EmptyCard
            title="No upcoming appointments"
            body="Book your first care session — it only takes a minute."
            cta={<Link to="/book" className="btn btn-primary">Book Care</Link>}
          />
        )}
        {upcoming.length > 0 && (
          <ul className="space-y-3">
            {upcoming.map((a) => (
              <AppointmentCard key={a.appointment_id} appt={a} viewerRole="care_receiver" />
            ))}
          </ul>
        )}
      </Section>

      {/* Past — only render section if there's something here. */}
      {past.length > 0 && (
        <Section title="Past" count={past.length}>
          <ul className="space-y-3">
            {past.map((a) => (
              <AppointmentCard key={a.appointment_id} appt={a} viewerRole="care_receiver" />
            ))}
          </ul>
        </Section>
      )}
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// CAREGIVER DASHBOARD
// ════════════════════════════════════════════════════════════
function CaregiverHome() {
  const { user } = useAuth();
  const navigate = useNavigate();
  const [serviceArea, setServiceArea] = useState(loadServiceArea);
  const [open, setOpen] = useState(null);
  const [scheduled, setScheduled] = useState(null);
  const [error, setError] = useState('');
  // Persist the user's preferred view (list vs map) for the session. Map
  // is only available when a service area is set — without one we have
  // nothing to center on.
  const [viewMode, setViewMode] = useState('list');

  // Refetch open requests whenever the service area changes (or clears).
  // Scheduled jobs are unaffected by location, so they fetch once on mount.
  useEffect(() => {
    setOpen(null);
    appointments.list('requested', serviceArea ? {
      lat: serviceArea.lat,
      lng: serviceArea.lng,
      radiusMiles: serviceArea.radiusMiles,
    } : undefined)
      .then((a) => setOpen(a.data || []))
      .catch((err) => setError(err.message));
  }, [serviceArea]);

  useEffect(() => {
    appointments.list('scheduled')
      .then((b) => setScheduled(b.data || []))
      .catch((err) => setError(err.message));
  }, []);

  const filterDescription = serviceArea
    ? `Within ${serviceArea.radiusMiles} miles of ${serviceArea.zip}.`
    : 'Care receivers waiting for someone to accept.';

  return (
    <div>
      <Greeting name={user.firstName} subtitle="Open requests and your scheduled jobs." />

      {error && <p className="alert alert-error mb-6">{error}</p>}

      <ServiceAreaCard area={serviceArea} onChange={setServiceArea} />

      <Section
        title="Open requests"
        subtitle={filterDescription}
        count={open?.length}
        icon={Search}
        action={serviceArea && open && open.length > 0 ? (
          <ViewToggle value={viewMode} onChange={setViewMode} />
        ) : null}
      >
        {open === null && <Skeleton rows={2} />}
        {open && open.length === 0 && (
          <EmptyCard
            title={serviceArea ? 'Nothing open in your area right now' : 'No open requests right now'}
            body={serviceArea
              ? 'Try widening your radius, or check back in a bit.'
              : 'When a care receiver books, their request will appear here.'}
          />
        )}
        {open && open.length > 0 && viewMode === 'list' && (
          <ul className="space-y-3">
            {open.map((a) => (
              <AppointmentCard key={a.appointment_id} appt={a} viewerRole="caregiver" mode="discover" />
            ))}
          </ul>
        )}
        {open && open.length > 0 && viewMode === 'map' && serviceArea && (
          <AppointmentsMap
            center={[serviceArea.lat, serviceArea.lng]}
            radiusMiles={serviceArea.radiusMiles}
            appointments={open}
            onSelect={(a) => navigate(`/appointments/${a.appointment_id}`)}
          />
        )}
      </Section>

      <Section title="My scheduled jobs" count={scheduled?.length}>
        {scheduled === null && <Skeleton rows={1} />}
        {scheduled && scheduled.length === 0 && (
          <EmptyCard
            title="No scheduled jobs yet"
            body="Accept an open request above to see it here."
          />
        )}
        {scheduled && scheduled.length > 0 && (
          <ul className="space-y-3">
            {scheduled.map((a) => (
              <AppointmentCard key={a.appointment_id} appt={a} viewerRole="caregiver" />
            ))}
          </ul>
        )}
      </Section>
    </div>
  );
}

// ════════════════════════════════════════════════════════════
// SHARED COMPONENTS
// ════════════════════════════════════════════════════════════

function Greeting({ name, subtitle }) {
  return (
    <header className="mb-8">
      <h1 className="text-3xl font-bold tracking-tight text-[var(--color-neutral-900)]">
        Welcome{name ? `, ${name}` : ''}.
      </h1>
      {subtitle && (
        <p className="mt-2 text-lg text-[var(--color-neutral-600)]">{subtitle}</p>
      )}
    </header>
  );
}

function Section({ title, subtitle, count, icon: Icon, action, children }) {
  return (
    <section className="mb-10">
      <div className="mb-4 flex items-end justify-between gap-4">
        <div>
          <h2 className="flex items-center gap-2 text-xl font-bold text-[var(--color-neutral-900)]">
            {Icon && <Icon size={20} strokeWidth={2.2} className="text-[var(--color-neutral-500)]" aria-hidden="true" />}
            {title}
            {typeof count === 'number' && (
              <span className="ml-1 rounded-full bg-[var(--color-neutral-100)] px-2.5 py-0.5 text-base font-semibold text-[var(--color-neutral-700)]">
                {count}
              </span>
            )}
          </h2>
          {subtitle && (
            <p className="mt-1 text-base text-[var(--color-neutral-500)]">{subtitle}</p>
          )}
        </div>
        {action && <div className="shrink-0">{action}</div>}
      </div>
      {children}
    </section>
  );
}

// Two-button group toggle. Used to flip between list and map view of open
// requests on the caregiver dashboard.
function ViewToggle({ value, onChange }) {
  const opts = [
    { id: 'list', label: 'List', icon: List },
    { id: 'map',  label: 'Map',  icon: MapIcon },
  ];
  return (
    <div role="tablist" aria-label="Open requests view" className="inline-flex rounded-lg border border-[var(--color-border)] bg-white p-1">
      {opts.map((o) => {
        const active = value === o.id;
        return (
          <button
            key={o.id}
            type="button"
            role="tab"
            aria-selected={active}
            onClick={() => onChange(o.id)}
            className={`inline-flex h-9 items-center gap-1.5 rounded-md px-3 text-sm font-semibold transition ${
              active
                ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-800)]'
                : 'text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-50)]'
            }`}
          >
            <o.icon size={16} strokeWidth={2.2} aria-hidden="true" />
            {o.label}
          </button>
        );
      })}
    </div>
  );
}

function AppointmentCard({ appt, viewerRole, mode }) {
  const counterparty = viewerRole === 'caregiver'
    ? `${appt.receiver_first_name || ''} ${appt.receiver_last_name || ''}`.trim() || 'Care receiver'
    : (appt.caregiver_first_name && appt.caregiver_last_name)
      ? `${appt.caregiver_first_name} ${appt.caregiver_last_name}`
      : 'Awaiting caregiver';

  // distance_miles is only set when the caller passed lat/lng. Show it
  // prominently on caregiver discovery cards — it's the most relevant fact
  // when deciding which open request to take.
  const distance = typeof appt.distance_miles === 'number' ? appt.distance_miles : null;

  return (
    <li>
      <Link
        to={`/appointments/${appt.appointment_id}`}
        className="block rounded-xl border border-[var(--color-border)] bg-white p-5 transition hover:border-[var(--color-primary-300)] hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="flex flex-wrap items-center gap-2">
              <span className="text-lg font-semibold text-[var(--color-neutral-900)]">
                {counterparty}
              </span>
              {distance !== null && (
                <span className="inline-flex items-center gap-1 rounded-full bg-[var(--color-primary-50)] px-2.5 py-0.5 text-sm font-semibold text-[var(--color-primary-700)]">
                  <MapPin size={12} strokeWidth={2.5} aria-hidden="true" />
                  {fmtDistance(distance)}
                </span>
              )}
            </div>
            <div className="mt-2 flex flex-col gap-1.5 text-base text-[var(--color-neutral-600)] sm:flex-row sm:items-center sm:gap-4">
              <span className="inline-flex items-center gap-1.5">
                <Clock size={16} strokeWidth={2} aria-hidden="true" />
                {fmtDateTime(appt.start_time, appt.end_time)}
              </span>
              {appt.address_line1 && (
                <span className="inline-flex items-center gap-1.5">
                  <MapPin size={16} strokeWidth={2} aria-hidden="true" />
                  {appt.address_line1}
                </span>
              )}
            </div>
            {appt.notes && (
              <p className="mt-3 line-clamp-2 text-base text-[var(--color-neutral-700)]">
                {appt.notes}
              </p>
            )}
          </div>
          <StatusBadge status={appt.status} />
        </div>
        {mode === 'discover' && (
          <p className="mt-4 text-base font-semibold text-[var(--color-primary-700)]">
            View details and accept →
          </p>
        )}
      </Link>
    </li>
  );
}

function fmtDistance(miles) {
  if (miles < 0.1) return 'Right here';
  if (miles < 1) return `${(miles * 10 | 0) / 10} mi`;
  if (miles < 10) return `${miles.toFixed(1)} mi`;
  return `${Math.round(miles)} mi`;
}

function EmptyCard({ title, body, cta }) {
  return (
    <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-white p-8 text-center">
      <p className="text-lg font-semibold text-[var(--color-neutral-900)]">{title}</p>
      {body && <p className="mt-2 text-base text-[var(--color-neutral-600)]">{body}</p>}
      {cta && <div className="mt-5">{cta}</div>}
    </div>
  );
}

function Skeleton({ rows = 2 }) {
  return (
    <div className="space-y-3">
      {Array.from({ length: rows }).map((_, i) => (
        <div key={i} className="h-28 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
      ))}
    </div>
  );
}

function fmtDateTime(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateOpts = { weekday: 'long', month: 'short', day: 'numeric' };
  const timeOpts = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleDateString(undefined, dateOpts)} · ${start.toLocaleTimeString(undefined, timeOpts)} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
}
