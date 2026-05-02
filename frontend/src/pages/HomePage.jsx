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
import { Link } from 'react-router-dom';
import { CalendarPlus, Search, MapPin, Clock } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { appointments } from '../api/client';
import StatusBadge from '../components/StatusBadge';

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
  const [open, setOpen] = useState(null);
  const [scheduled, setScheduled] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    Promise.all([
      appointments.list('requested'),
      appointments.list('scheduled'),
    ])
      .then(([a, b]) => {
        setOpen(a.data || []);
        setScheduled(b.data || []);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <Greeting name={user.firstName} subtitle="Open requests and your scheduled jobs." />

      {error && <p className="alert alert-error mb-6">{error}</p>}

      <Section
        title="Open requests"
        subtitle="Care receivers waiting for someone to accept."
        count={open?.length}
        icon={Search}
      >
        {open === null && <Skeleton rows={2} />}
        {open && open.length === 0 && (
          <EmptyCard
            title="No open requests right now"
            body="When a care receiver books, their request will appear here."
          />
        )}
        {open && open.length > 0 && (
          <ul className="space-y-3">
            {open.map((a) => (
              <AppointmentCard key={a.appointment_id} appt={a} viewerRole="caregiver" mode="discover" />
            ))}
          </ul>
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

function Section({ title, subtitle, count, icon: Icon, children }) {
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
      </div>
      {children}
    </section>
  );
}

function AppointmentCard({ appt, viewerRole, mode }) {
  const counterparty = viewerRole === 'caregiver'
    ? `${appt.receiver_first_name || ''} ${appt.receiver_last_name || ''}`.trim() || 'Care receiver'
    : (appt.caregiver_first_name && appt.caregiver_last_name)
      ? `${appt.caregiver_first_name} ${appt.caregiver_last_name}`
      : 'Awaiting caregiver';

  return (
    <li>
      <Link
        to={`/appointments/${appt.appointment_id}`}
        className="block rounded-xl border border-[var(--color-border)] bg-white p-5 transition hover:border-[var(--color-primary-300)] hover:shadow-md"
      >
        <div className="flex items-start justify-between gap-4">
          <div className="min-w-0">
            <div className="text-lg font-semibold text-[var(--color-neutral-900)]">
              {counterparty}
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
