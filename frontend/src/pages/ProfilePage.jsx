// ProfilePage — full account snapshot: identity, addresses (care receiver),
// appointments summary, role-specific details, admin platform metrics.
//
// Decorative avatars: simple inline SVG “drawings” per role (not user uploads).

import { useEffect, useMemo, useState } from 'react';
import { Link } from 'react-router-dom';
import {
  Building2,
  CalendarDays,
  HeartHandshake,
  Mail,
  MapPin,
  Phone,
  Shield,
  Sparkles,
  Star,
  UserCircle2,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { addresses, appointments, auth, admin } from '../api/client';
import StatusBadge from '../components/StatusBadge';

/** Small square “sketch” for the profile header (line-art style). */
function ProfileAvatarDrawing({ role }) {
  const common = 'h-full w-full';
  if (role === 'caregiver') {
    return (
      <svg className={common} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="50" cy="32" r="14" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M28 88c0-22 12-34 22-34s22 12 22 34" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M62 38h12c4 0 8 3 9 7l4 14" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.85" />
        <circle cx="80" cy="62" r="5" stroke="currentColor" strokeWidth="2" />
        <path d="M18 52l8 8M22 48l8 8" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.45" />
      </svg>
    );
  }
  if (role === 'admin') {
    return (
      <svg className={common} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M50 12L62 20v14c0 12-6 22-12 26-6-4-12-14-12-26V20l12-8Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M42 38h16M50 38v10" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="22" y="58" width="10" height="24" rx="2" stroke="currentColor" strokeWidth="2.2" />
        <rect x="36" y="50" width="10" height="32" rx="2" stroke="currentColor" strokeWidth="2.2" />
        <rect x="50" y="54" width="10" height="28" rx="2" stroke="currentColor" strokeWidth="2.2" />
        <rect x="64" y="46" width="10" height="36" rx="2" stroke="currentColor" strokeWidth="2.2" />
        <path d="M24 86h54" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.4" />
      </svg>
    );
  }
  /* care_receiver (default) */
  return (
    <svg className={common} viewBox="0 0 100 100" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M22 42h40v36H22V42Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M30 42V34c0-6 5-11 12-11s12 5 12 11v8" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M34 54h16M34 64h22" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.5" />
      <path
        d="M50 58c-4-3-10-1-10 4 0 6 10 12 10 12s10-6 10-12c0-5-6-7-10-4Z"
        fill="currentColor"
        fillOpacity="0.12"
        stroke="currentColor"
        strokeWidth="2"
        strokeLinejoin="round"
      />
      <circle cx="72" cy="28" r="10" stroke="currentColor" strokeWidth="2" opacity="0.35" />
      <path d="M78 76c8 2 14 8 16 16" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.35" />
    </svg>
  );
}

/** Larger decorative panel art (same motifs, more detail). */
function ProfileHeroPanelDrawing({ role }) {
  const common = 'h-full w-full max-h-[220px]';
  if (role === 'caregiver') {
    return (
      <svg className={common} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <circle cx="100" cy="58" r="28" stroke="currentColor" strokeWidth="2.5" />
        <path d="M48 172c4-40 28-62 52-62s48 22 52 62" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
        <path d="M128 70h36c10 0 18 8 20 18l8 32" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <circle cx="174" cy="128" r="10" stroke="currentColor" strokeWidth="2.2" />
        <path d="M38 96l14 14M44 88l14 14M32 110l10 10" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.35" />
        <path d="M154 154c12 4 22 14 28 26" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.3" />
      </svg>
    );
  }
  if (role === 'admin') {
    return (
      <svg className={common} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
        <path d="M100 24l28 16v28c0 22-12 42-28 52-16-10-28-30-28-52V40l28-16Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
        <path d="M88 72h24M100 72v20" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" />
        <rect x="36" y="112" width="20" height="48" rx="3" stroke="currentColor" strokeWidth="2.2" />
        <rect x="64" y="96" width="20" height="64" rx="3" stroke="currentColor" strokeWidth="2.2" />
        <rect x="92" y="104" width="20" height="56" rx="3" stroke="currentColor" strokeWidth="2.2" />
        <rect x="120" y="88" width="20" height="72" rx="3" stroke="currentColor" strokeWidth="2.2" />
        <path d="M148 88l16-8v24l-16-8" stroke="currentColor" strokeWidth="2" strokeLinejoin="round" opacity="0.45" />
        <circle cx="156" cy="140" r="6" stroke="currentColor" strokeWidth="2" />
        <circle cx="172" cy="156" r="4" stroke="currentColor" strokeWidth="2" opacity="0.5" />
        <path d="M32 172h136" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.25" />
      </svg>
    );
  }
  return (
    <svg className={common} viewBox="0 0 200 200" fill="none" xmlns="http://www.w3.org/2000/svg" aria-hidden="true">
      <path d="M44 88h88v72H44V88Z" stroke="currentColor" strokeWidth="2.5" strokeLinejoin="round" />
      <path d="M60 88V72c0-14 12-26 28-26s28 12 28 26v16" stroke="currentColor" strokeWidth="2.5" strokeLinecap="round" />
      <path d="M64 108h36M64 124h52M64 140h40" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.45" />
      <path
        d="M100 118c-8-6-20-2-20 8 0 12 20 24 20 24s20-12 20-24c0-10-12-14-20-8Z"
        fill="currentColor"
        fillOpacity="0.1"
        stroke="currentColor"
        strokeWidth="2.2"
        strokeLinejoin="round"
      />
      <circle cx="152" cy="52" r="22" stroke="currentColor" strokeWidth="2.2" opacity="0.3" />
      <path d="M164 156c14 4 26 16 32 32" stroke="currentColor" strokeWidth="2.2" strokeLinecap="round" opacity="0.28" />
      <path d="M24 48c6-6 16-6 22 0M18 64c8-4 18-2 24 4" stroke="currentColor" strokeWidth="2" strokeLinecap="round" opacity="0.25" />
    </svg>
  );
}

function ProfileHeroAside({ role }) {
  return (
    <div
      className="relative hidden min-h-[280px] overflow-hidden border-l border-[var(--color-border)] md:block"
      aria-hidden="true"
    >
      <div className="absolute inset-0 bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-success-50)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_80%_60%_at_100%_20%,var(--color-primary-100),transparent_55%)]" />
      <div className="absolute inset-0 bg-[radial-gradient(ellipse_70%_50%_at_0%_100%,var(--color-success-100),transparent_50%)]" />
      <div
        className="absolute inset-0 opacity-[0.4]"
        style={{
          backgroundImage:
            'radial-gradient(circle at 1px 1px, var(--color-border-strong) 1px, transparent 0)',
          backgroundSize: '22px 22px',
        }}
      />
      <div className="absolute -right-10 top-4 h-44 w-44 rounded-full bg-[var(--color-primary-200)]/45 blur-3xl" />
      <div className="absolute -bottom-12 -left-6 h-52 w-52 rounded-full bg-[var(--color-success-200)]/40 blur-3xl" />
      <div className="absolute right-6 top-1/2 w-px -translate-y-1/2 bg-gradient-to-b from-transparent via-[var(--color-primary-300)]/50 to-transparent" style={{ height: '65%' }} />
      <svg className="absolute right-2 top-8 h-24 w-24 text-[var(--color-primary-300)]/50" viewBox="0 0 100 100" fill="none" aria-hidden="true">
        <circle cx="50" cy="50" r="38" stroke="currentColor" strokeWidth="1.5" strokeDasharray="6 10" />
        <circle cx="50" cy="50" r="24" stroke="currentColor" strokeWidth="1.2" opacity="0.6" />
      </svg>
      <svg className="absolute bottom-6 left-4 h-14 w-28 text-[var(--color-success-400)]/35" viewBox="0 0 120 40" preserveAspectRatio="none" aria-hidden="true">
        <path d="M0 28 Q30 8 60 28 T120 28 L120 40 L0 40Z" fill="currentColor" />
      </svg>
      <div className="relative z-[1] flex h-full min-h-[280px] flex-col items-center justify-center px-5 py-8 text-[var(--color-primary-700)]">
        <div className="w-full max-w-[200px] drop-shadow-[0_8px_24px_rgba(15,23,42,0.08)]">
          <ProfileHeroPanelDrawing role={role} />
        </div>
        <p className="mt-4 max-w-[220px] text-center text-sm font-semibold leading-snug text-[var(--color-neutral-600)]">
          {role === 'caregiver' && 'Care you give, documented with warmth.'}
          {role === 'admin' && 'Platform health at a glance.'}
          {(role === 'care_receiver' || !role) && 'Home is where good care belongs.'}
        </p>
      </div>
    </div>
  );
}

export default function ProfilePage() {
  const { user: ctxUser } = useAuth();
  const [me, setMe] = useState(null);
  const [addrList, setAddrList] = useState(null);
  const [apptList, setApptList] = useState(null);
  const [adminDash, setAdminDash] = useState(null);
  const [adminStats, setAdminStats] = useState(null);
  const [error, setError] = useState('');

  const role = me?.role || ctxUser?.role;

  useEffect(() => {
    let cancelled = false;
    setError('');
    (async () => {
      try {
        const meRes = await auth.me();
        if (cancelled) return;
        const full = meRes.data || {};
        setMe(full);

        const promises = [appointments.list()];

        if (full.role === 'care_receiver') {
          promises.push(addresses.list());
        }
        if (full.role === 'admin') {
          promises.push(admin.dashboard(), admin.appointmentStats('30d'));
        }

        const results = await Promise.all(promises);
        if (cancelled) return;

        setApptList(results[0]?.data || []);

        if (full.role === 'care_receiver') {
          setAddrList(results[1]?.data || []);
        }
        if (full.role === 'admin') {
          setAdminDash(results[1]?.data || null);
          setAdminStats(results[2] || null);
        }
      } catch (e) {
        if (!cancelled) setError(e.message || 'Could not load profile.');
      }
    })();
    return () => { cancelled = true; };
  }, []);

  const displayName = useMemo(() => {
    const p = me?.profile;
    const fn = p?.first_name || ctxUser?.firstName;
    const ln = p?.last_name || ctxUser?.lastName;
    if (fn || ln) return [fn, ln].filter(Boolean).join(' ');
    return ctxUser?.email || me?.email || 'Your account';
  }, [me, ctxUser]);

  const roleLabel =
    role === 'care_receiver' ? 'Care receiver' :
    role === 'caregiver' ? 'Caregiver' :
    role === 'admin' ? 'Administrator' : 'Member';

  if (!ctxUser) return null;

  return (
    <div id="main">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-neutral-900)]">
          Your profile
        </h1>
        <p className="mt-2 text-lg text-[var(--color-neutral-600)]">
          Everything about your CareConnect account in one place.
        </p>
      </header>

      {error && <p className="alert alert-error mb-6" role="alert">{error}</p>}

      {/* Hero — identity */}
      <section className="mb-8 overflow-hidden rounded-2xl border border-[var(--color-border)] bg-white shadow-sm">
        <div className="grid gap-0 md:grid-cols-[minmax(0,1fr)_minmax(260px,320px)]">
          <div className="p-6 sm:p-8">
            <div className="flex flex-col gap-6 sm:flex-row sm:items-start">
              <div className="shrink-0">
                <div className="relative">
                  <div className="flex h-[7.5rem] w-[7.5rem] items-center justify-center overflow-hidden rounded-2xl bg-gradient-to-br from-[var(--color-primary-50)] via-white to-[var(--color-success-50)] shadow-md ring-2 ring-[var(--color-primary-100)] text-[var(--color-primary-700)]">
                    <div className="h-[5.25rem] w-[5.25rem]">
                      <ProfileAvatarDrawing role={role} />
                    </div>
                  </div>
                  <span className="sr-only">Decorative illustration for {roleLabel}</span>
                </div>
              </div>
              <div className="min-w-0 flex-1">
                <h2 className="text-2xl font-bold text-[var(--color-neutral-900)]">
                  {displayName}
                </h2>
                <p className="mt-1 text-base font-medium text-[var(--color-neutral-500)]">
                  {roleLabel}
                </p>
                <p className="mt-2 flex flex-wrap items-center gap-x-3 gap-y-1 text-base text-[var(--color-neutral-600)]">
                  <span className="inline-flex items-center gap-1.5">
                    <Mail size={18} strokeWidth={2} aria-hidden="true" />
                    {me?.email || ctxUser.email}
                  </span>
                  {role === 'admin' && me?.created_at && (
                    <span className="inline-flex items-center gap-1.5 text-sm text-[var(--color-neutral-500)]">
                      Account since {fmtDateOnly(me.created_at)}
                    </span>
                  )}
                </p>
                {me?.is_active === false && (
                  <p className="alert alert-warning mt-4">
                    This account is inactive. Contact support if this is unexpected.
                  </p>
                )}
                <div className="mt-6 flex flex-wrap gap-3">
                  <Link to="/appointments" className="btn btn-secondary">
                    <CalendarDays size={20} strokeWidth={2.2} aria-hidden="true" />
                    All appointments
                  </Link>
                  {role === 'care_receiver' && (
                    <Link to="/book" className="btn btn-primary">
                      Book care
                    </Link>
                  )}
                </div>
              </div>
            </div>
          </div>
          <ProfileHeroAside role={role} />
        </div>
      </section>

      <div className="grid gap-6 lg:grid-cols-2">
        {/* Addresses — care receiver only (API restriction) */}
        {role === 'care_receiver' && (
          <section className="card">
            <h3 className="flex items-center gap-2 text-xl font-bold text-[var(--color-neutral-900)]">
              <MapPin size={22} strokeWidth={2.2} aria-hidden="true" />
              Your addresses
            </h3>
            <p className="mt-1 text-base text-[var(--color-neutral-600)]">
              Places where care can take place. Your primary address is used first when you book.
            </p>
            {addrList === null && !error && (
              <ul className="mt-5 space-y-3">
                {[0, 1].map((i) => (
                  <li key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
                ))}
              </ul>
            )}
            {addrList && addrList.length === 0 && (
              <p className="mt-5 rounded-xl border border-dashed border-[var(--color-border-strong)] bg-[var(--color-neutral-50)] p-6 text-center text-[var(--color-neutral-600)]">
                No saved addresses yet. Add one when you book care.
              </p>
            )}
            {addrList && addrList.length > 0 && (
              <ul className="mt-5 space-y-3">
                {addrList.map((a) => (
                  <li
                    key={a.address_id}
                    className="rounded-xl border border-[var(--color-border)] bg-[var(--color-neutral-50)] p-4"
                  >
                    <div className="flex flex-wrap items-start justify-between gap-2">
                      <div className="font-semibold text-[var(--color-neutral-900)]">
                        {a.nickname || 'Home'}
                        {a.is_primary ? (
                          <span className="ml-2 rounded-full bg-[var(--color-primary-100)] px-2 py-0.5 text-xs font-bold text-[var(--color-primary-800)]">
                            Primary
                          </span>
                        ) : null}
                      </div>
                    </div>
                    <p className="mt-2 text-base text-[var(--color-neutral-700)]">
                      {[a.address_line1, a.address_line2].filter(Boolean).join(', ')}
                    </p>
                    <p className="text-base text-[var(--color-neutral-600)]">
                      {[a.city, a.state, a.zip_code].filter(Boolean).join(', ')}
                    </p>
                  </li>
                ))}
              </ul>
            )}
          </section>
        )}

        {/* Role-specific panel */}
        <section className="card">
          <h3 className="flex items-center gap-2 text-xl font-bold text-[var(--color-neutral-900)]">
            {role === 'caregiver' && <HeartHandshake size={22} strokeWidth={2.2} aria-hidden="true" />}
            {role === 'care_receiver' && <UserCircle2 size={22} strokeWidth={2.2} aria-hidden="true" />}
            {role === 'admin' && <Shield size={22} strokeWidth={2.2} aria-hidden="true" />}
            About your role
          </h3>
          <p className="mt-1 text-base text-[var(--color-neutral-600)]">
            {role === 'caregiver' && 'Details caregivers see on their public-facing profile.'}
            {role === 'care_receiver' && 'A few details that help caregivers prepare for your visit.'}
            {role === 'admin' && 'Platform oversight — high-level counts only on this screen.'}
          </p>

          {role === 'caregiver' && me?.profile && (
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <InfoItem icon={Phone} label="Phone" value={me.profile.phone || '—'} />
              <InfoItem
                icon={Star}
                label="Rating"
                value={
                  me.profile.rating != null
                    ? `${Number(me.profile.rating).toFixed(2)} / 5`
                    : '—'
                }
              />
              <InfoItem
                icon={Shield}
                label="Verification"
                value={me.profile.is_verified ? 'Verified' : 'Not verified yet'}
              />
              <InfoItem icon={Mail} label="Public email" value={me.profile.email || me.email} />
            </dl>
          )}

          {role === 'care_receiver' && me?.profile && (
            <dl className="mt-5 grid gap-4 sm:grid-cols-2">
              <InfoItem
                label="Birthday"
                value={me.profile.birthday ? fmtDateOnly(me.profile.birthday) : '—'}
              />
              <InfoItem label="Sex" value={me.profile.sex || '—'} />
            </dl>
          )}

          {role === 'admin' && (
            <div className="mt-5 space-y-4">
              {!adminDash && !error && (
                <div className="h-32 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
              )}
              {adminDash && (
                <div className="grid gap-3 sm:grid-cols-2">
                  <AdminStat
                    icon={UserCircle2}
                    label="Registered users"
                    value={adminDash.users?.total ?? '—'}
                  />
                  <AdminStat
                    icon={CalendarDays}
                    label="Appointments (all time)"
                    value={adminDash.appointments?.total ?? '—'}
                  />
                  <AdminStat
                    icon={Building2}
                    label="Open requests"
                    value={adminDash.appointments?.requested ?? '—'}
                  />
                  <AdminStat
                    icon={HeartHandshake}
                    label="Scheduled"
                    value={adminDash.appointments?.scheduled ?? '—'}
                  />
                  <AdminStat
                    icon={Sparkles}
                    label="Completed"
                    value={adminDash.appointments?.completed ?? '—'}
                  />
                  <AdminStat
                    icon={MapPin}
                    label="Cancelled"
                    value={adminDash.appointments?.cancelled ?? '—'}
                  />
                </div>
              )}
              {adminStats?.data && Array.isArray(adminStats.data) && adminStats.data.length > 0 && (
                <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-neutral-50)] p-4">
                  <p className="text-sm font-semibold uppercase tracking-wide text-[var(--color-neutral-500)]">
                    Last 30 days — daily volume
                  </p>
                  <p className="mt-1 text-base text-[var(--color-neutral-600)]">
                    {adminStats.data.length} day{adminStats.data.length === 1 ? '' : 's'} of data
                    (see API docs for full charts in a future release).
                  </p>
                </div>
              )}
            </div>
          )}

          {!me && !error && (
            <div className="mt-5 h-24 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
          )}
        </section>
      </div>

      {/* Appointments snapshot */}
      <section className="card mt-6">
        <div className="flex flex-col gap-3 sm:flex-row sm:items-end sm:justify-between">
          <div>
            <h3 className="flex items-center gap-2 text-xl font-bold text-[var(--color-neutral-900)]">
              <CalendarDays size={22} strokeWidth={2.2} aria-hidden="true" />
              Appointments
            </h3>
            <p className="mt-1 text-base text-[var(--color-neutral-600)]">
              {role === 'admin'
                ? 'Every appointment in the system (most recent first in the full list).'
                : 'A quick look at your latest activity.'}
            </p>
          </div>
          <Link to="/appointments" className="btn btn-secondary shrink-0 self-start sm:self-auto">
            Open full list
          </Link>
        </div>

        {apptList === null && !error && (
          <ul className="mt-5 space-y-3">
            {[0, 1, 2].map((i) => (
              <li key={i} className="h-24 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
            ))}
          </ul>
        )}

        {apptList && apptList.length === 0 && (
          <p className="mt-5 text-center text-[var(--color-neutral-600)]">
            No appointments to show yet.
          </p>
        )}

        {apptList && apptList.length > 0 && (
          <ul className="mt-5 space-y-3">
            {apptList.slice(0, 5).map((a) => (
              <li key={a.appointment_id}>
                <Link
                  to={`/appointments/${a.appointment_id}`}
                  className="flex flex-col gap-3 rounded-xl border border-[var(--color-border)] bg-white p-4 transition hover:border-[var(--color-primary-300)] hover:shadow-md sm:flex-row sm:items-center sm:justify-between"
                >
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-[var(--color-neutral-900)]">
                      {appointmentTitle(a, role)}
                    </div>
                    <div className="mt-1 text-base text-[var(--color-neutral-600)]">
                      {fmtDateTime(a.start_time, a.end_time)}
                    </div>
                  </div>
                  <StatusBadge status={a.status} />
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}

function InfoItem({ icon: Icon, label, value }) {
  return (
    <div className="rounded-xl border border-[var(--color-border)] bg-[var(--color-neutral-50)] p-4">
      <dt className="flex items-center gap-2 text-sm font-semibold uppercase tracking-wide text-[var(--color-neutral-500)]">
        {Icon && <Icon size={16} strokeWidth={2.2} aria-hidden="true" />}
        {label}
      </dt>
      <dd className="mt-2 text-lg font-semibold text-[var(--color-neutral-900)]">{value}</dd>
    </div>
  );
}

function AdminStat({ icon: Icon, label, value }) {
  return (
    <div className="flex items-start gap-3 rounded-xl border border-[var(--color-border)] bg-[var(--color-neutral-50)] p-4">
      <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-[var(--color-primary-100)] text-[var(--color-primary-800)]">
        <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
      </div>
      <div>
        <p className="text-sm font-semibold text-[var(--color-neutral-500)]">{label}</p>
        <p className="text-2xl font-bold text-[var(--color-neutral-900)]">{value}</p>
      </div>
    </div>
  );
}

function appointmentTitle(a, role) {
  if (role === 'caregiver') {
    const name = `${a.receiver_first_name || ''} ${a.receiver_last_name || ''}`.trim();
    return name || 'Care receiver';
  }
  if (role === 'admin') {
    const recv = `${a.receiver_first_name || ''} ${a.receiver_last_name || ''}`.trim();
    const care = `${a.caregiver_first_name || ''} ${a.caregiver_last_name || ''}`.trim();
    if (recv && care) return `${recv} → ${care}`;
    if (recv) return recv;
    return 'Appointment';
  }
  if (a.caregiver_first_name && a.caregiver_last_name) {
    return `${a.caregiver_first_name} ${a.caregiver_last_name}`;
  }
  return 'Looking for a caregiver';
}

function fmtDateTime(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateOpts = { weekday: 'long', month: 'short', day: 'numeric' };
  const timeOpts = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleDateString(undefined, dateOpts)} · ${start.toLocaleTimeString(undefined, timeOpts)} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
}

function fmtDateOnly(iso) {
  const d = new Date(iso);
  return d.toLocaleDateString(undefined, { year: 'numeric', month: 'long', day: 'numeric' });
}
