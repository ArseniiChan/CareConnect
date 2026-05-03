// AppointmentsPage — full list of the user's appointments, any status.
// Care receiver: their bookings. Caregiver: their assignments only
// (for the open-request discovery feed, see HomePage's caregiver view).

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { Clock, MapPin, Search } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { appointments } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import Avatar from '../components/Avatar';

export default function AppointmentsPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    appointments.list()
      .then((res) => setItems(res.data || []))
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-neutral-900)]">
          My appointments
        </h1>
        <p className="mt-2 text-lg text-[var(--color-neutral-600)]">
          {user?.role === 'caregiver'
            ? 'Jobs you have accepted, completed, or cancelled.'
            : 'Care you have booked, in any status.'}
        </p>
      </header>

      {error && <p className="alert alert-error mb-6">{error}</p>}

      {items === null && !error && (
        <div className="space-y-3">
          {[0, 1, 2].map((i) => (
            <div key={i} className="h-28 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-white p-10 text-center">
          <p className="text-lg font-semibold text-[var(--color-neutral-900)]">
            Nothing here yet
          </p>
          <p className="mt-2 text-base text-[var(--color-neutral-600)]">
            {user?.role === 'caregiver'
              ? 'Accept an open request from your home page to start.'
              : 'Book your first visit. It takes under a minute.'}
          </p>
          {user?.role === 'care_receiver' && (
            <Link to="/book" className="btn btn-primary mt-5 inline-flex">
              Book a visit
            </Link>
          )}
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((a) => {
            const counterparty = user?.role === 'caregiver'
              ? `${a.receiver_first_name || ''} ${a.receiver_last_name || ''}`.trim() || 'Care receiver'
              : (a.caregiver_first_name && a.caregiver_last_name)
                ? `${a.caregiver_first_name} ${a.caregiver_last_name}`
                : 'Looking for a caregiver';
            const hasPerson = !counterparty.startsWith('Looking');
            return (
              <li key={a.appointment_id}>
                <Link
                  to={`/appointments/${a.appointment_id}`}
                  className="block rounded-xl border border-[var(--color-border)] bg-white p-5 transition-all duration-150 hover:-translate-y-0.5 hover:border-[var(--color-primary-300)] hover:shadow-[0_8px_24px_-8px_hsl(205,67%,45%,0.25)]"
                >
                  <div className="flex items-start gap-4">
                    {hasPerson ? (
                      <Avatar name={counterparty} size={48} />
                    ) : (
                      <span
                        className="inline-flex h-12 w-12 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[var(--color-border-strong)] text-[var(--color-neutral-400)]"
                        aria-hidden="true"
                      >
                        <Search size={20} strokeWidth={2} />
                      </span>
                    )}
                    <div className="min-w-0 flex-1">
                      <div className="text-lg font-semibold text-[var(--color-neutral-900)]">
                        {counterparty}
                      </div>
                      <div className="mt-1.5 flex flex-col gap-1 text-base text-[var(--color-neutral-600)] sm:flex-row sm:items-center sm:gap-4">
                        <span className="inline-flex items-center gap-1.5">
                          <Clock size={16} strokeWidth={2} aria-hidden="true" />
                          {fmtDateTime(a.start_time, a.end_time)}
                        </span>
                        {a.address_line1 && (
                          <span className="inline-flex items-center gap-1.5">
                            <MapPin size={16} strokeWidth={2} aria-hidden="true" />
                            {a.address_line1}
                          </span>
                        )}
                      </div>
                      {a.notes && (
                        <p className="mt-3 line-clamp-2 text-base text-[var(--color-neutral-700)]">
                          {a.notes}
                        </p>
                      )}
                    </div>
                    <StatusBadge status={a.status} />
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
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
