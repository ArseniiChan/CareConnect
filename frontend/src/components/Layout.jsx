// App shell — header (desktop) + bottom tab bar (mobile).
//
// Older-user / accessibility considerations:
//   - Min 56px touch targets on mobile bottom nav (Apple/Google research)
//   - Icons + text labels (never icon-only)
//   - Generous spacing between tap zones
//   - Visible "current page" state via background pill, not just color
//   - Skip-to-content link for keyboard users
//   - User name + role visible in header (orientation: "where am I, who am I")

import { Link, NavLink, Outlet, useNavigate } from 'react-router-dom';
import {
  Home,
  CalendarPlus,
  CalendarDays,
  MessageCircle,
  User as UserIcon,
  LogOut,
  DollarSign,
} from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function Layout() {
  const { user, logout } = useAuth();
  const navigate = useNavigate();

  const navItems = [
    { label: 'Home', to: '/', icon: Home, end: true },
    user?.role === 'care_receiver' && {
      label: 'Book Care', to: '/book', icon: CalendarPlus,
    },
    { label: 'Appointments', to: '/appointments', icon: CalendarDays },
    { label: 'Messages', to: '/messages', icon: MessageCircle },
    user?.role === 'admin' && {
      label: 'Revenue', to: '/admin/revenue', icon: DollarSign,
    },
    { label: 'Profile', to: '/profile', icon: UserIcon },
  ].filter(Boolean);

  function handleLogout() {
    logout();
    navigate('/login', { replace: true });
  }

  // Friendly role label for display (not "care_receiver" jargon).
  const roleLabel =
    user?.role === 'care_receiver' ? 'Care Receiver' :
    user?.role === 'caregiver'     ? 'Caregiver' :
    user?.role === 'admin'         ? 'Admin' : '';

  return (
    <div className="min-h-screen">
      <a href="#main" className="skip-link">Skip to main content</a>

      {/* ── Desktop / tablet header ─────────────────────────────── */}
      <header className="sticky top-0 z-50 hidden border-b border-[var(--color-border)] bg-white/95 backdrop-blur md:block">
        <div className="mx-auto flex h-20 max-w-6xl items-center justify-between gap-6 px-6">
          <Link
            to="/"
            className="flex items-center gap-2 text-2xl font-bold tracking-tight text-[var(--color-neutral-900)]"
            aria-label="CareConnect home"
          >
            <span className="inline-block h-8 w-8 rounded-full bg-[var(--color-primary-600)]" aria-hidden="true" />
            CareConnect
          </Link>

          <nav className="flex items-center gap-2" aria-label="Main">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                end={item.end}
                className={({ isActive }) =>
                  `inline-flex h-12 items-center gap-2 rounded-[10px] px-4 text-base font-semibold transition ${
                    isActive
                      ? 'bg-[var(--color-primary-50)] text-[var(--color-primary-800)]'
                      : 'text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-50)] hover:text-[var(--color-neutral-900)]'
                  }`
                }
              >
                <item.icon size={20} strokeWidth={2.2} aria-hidden="true" />
                {item.label}
              </NavLink>
            ))}
          </nav>

          <div className="flex items-center gap-4">
            {user && (
              <div className="text-right leading-tight">
                <div className="text-base font-semibold text-[var(--color-neutral-900)]">
                  {user.firstName || user.email}
                </div>
                {roleLabel && (
                  <div className="text-sm text-[var(--color-neutral-500)]">{roleLabel}</div>
                )}
              </div>
            )}
            <button
              type="button"
              onClick={handleLogout}
              className="inline-flex h-12 items-center gap-2 rounded-[10px] border border-[var(--color-border-strong)] bg-white px-4 text-base font-semibold text-[var(--color-neutral-700)] transition hover:border-[var(--color-neutral-400)] hover:bg-[var(--color-neutral-50)]"
              aria-label="Sign out of CareConnect"
            >
              <LogOut size={18} strokeWidth={2.2} aria-hidden="true" />
              Sign out
            </button>
          </div>
        </div>
      </header>

      {/* ── Mobile header (compact, just brand + sign out) ─────── */}
      <header className="sticky top-0 z-50 border-b border-[var(--color-border)] bg-white/95 backdrop-blur md:hidden">
        <div className="flex h-16 items-center justify-between px-4">
          <Link
            to="/"
            className="flex items-center gap-2 text-xl font-bold tracking-tight text-[var(--color-neutral-900)]"
            aria-label="CareConnect home"
          >
            <span className="inline-block h-7 w-7 rounded-full bg-[var(--color-primary-600)]" aria-hidden="true" />
            CareConnect
          </Link>
          <button
            type="button"
            onClick={handleLogout}
            className="inline-flex h-11 items-center gap-1.5 rounded-[10px] px-3 text-sm font-semibold text-[var(--color-neutral-700)] hover:bg-[var(--color-neutral-50)]"
            aria-label="Sign out"
          >
            <LogOut size={18} strokeWidth={2.2} aria-hidden="true" />
            <span className="sr-only">Sign out</span>
          </button>
        </div>
      </header>

      {/* ── Main content ────────────────────────────────────────── */}
      <main
        id="main"
        className="mx-auto min-h-[calc(100vh-5rem)] max-w-6xl px-4 pb-28 pt-6 md:px-6 md:pb-10 md:pt-8"
      >
        <Outlet />
      </main>

      {/* ── Mobile bottom tab bar ───────────────────────────────── */}
      <nav
        className="fixed bottom-0 left-0 right-0 z-50 border-t border-[var(--color-border)] bg-white/97 backdrop-blur md:hidden"
        aria-label="Main"
      >
        <div
          className="mx-auto grid max-w-md px-2"
          style={{ gridTemplateColumns: `repeat(${navItems.length}, minmax(0, 1fr))` }}
        >
          {navItems.map((item) => (
            <NavLink
              key={item.to}
              to={item.to}
              end={item.end}
              className={({ isActive }) =>
                `flex h-16 flex-col items-center justify-center gap-1 text-xs font-semibold transition ${
                  isActive
                    ? 'text-[var(--color-primary-700)]'
                    : 'text-[var(--color-neutral-500)] hover:text-[var(--color-neutral-900)]'
                }`
              }
            >
              {({ isActive }) => (
                <>
                  <span
                    className={`flex h-8 w-12 items-center justify-center rounded-full transition ${
                      isActive ? 'bg-[var(--color-primary-50)]' : ''
                    }`}
                    aria-hidden="true"
                  >
                    <item.icon
                      size={22}
                      strokeWidth={isActive ? 2.4 : 2.0}
                    />
                  </span>
                  {item.label}
                </>
              )}
            </NavLink>
          ))}
        </div>
      </nav>
    </div>
  );
}
