// LoginPage — entry point for returning users.
//
// Older-user / a11y considerations:
//   - Labels above inputs (never placeholder-as-label — placeholders disappear)
//   - Inputs h-12 (48px), font-size matches body (no zoom-induced shifts)
//   - Primary button h-14 (56px) — exceeds Apple/Google guidance, comfortable
//     for arthritic / tremor-affected hands
//   - aria-live="polite" on error region so screen readers announce failures
//   - Generous whitespace, single column, no distractions

import { useState } from 'react';
import { useNavigate, useLocation, Link } from 'react-router-dom';
import { LogIn } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';

export default function LoginPage() {
  const navigate = useNavigate();
  const location = useLocation();
  const { login } = useAuth();
  const from = location.state?.from?.pathname || '/';

  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      await login(email, password);
      navigate(from, { replace: true });
    } catch (err) {
      setError(err.message || 'We could not sign you in. Please check your email and password.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        {/* Brand mark — orientation for users who land on this page directly. */}
        <div className="mb-8 flex items-center justify-center gap-3">
          <span className="inline-block h-10 w-10 rounded-full bg-[var(--color-primary-600)]" aria-hidden="true" />
          <span className="text-2xl font-bold tracking-tight text-[var(--color-neutral-900)]">
            CareConnect
          </span>
        </div>

        <form onSubmit={handleSubmit} className="card">
          <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--color-neutral-900)]">
            Welcome back
          </h1>
          <p className="mb-6 text-base text-[var(--color-neutral-600)]">
            Sign in to your CareConnect account.
          </p>

          <div className="mb-4">
            <label htmlFor="email" className="field-label">Email address</label>
            <input
              id="email"
              type="email"
              value={email}
              onChange={(e) => setEmail(e.target.value)}
              required
              autoComplete="email"
              autoFocus
              className="input"
            />
          </div>

          <div className="mb-5">
            <label htmlFor="password" className="field-label">Password</label>
            <input
              id="password"
              type="password"
              value={password}
              onChange={(e) => setPassword(e.target.value)}
              required
              autoComplete="current-password"
              className="input"
            />
          </div>

          <div role="alert" aria-live="polite" className={error ? 'mb-4' : ''}>
            {error && <p className="alert alert-error">{error}</p>}
          </div>

          <button
            type="submit"
            disabled={submitting}
            className="btn btn-primary btn-lg w-full"
          >
            {submitting ? (
              'Signing in…'
            ) : (
              <>
                <LogIn size={20} strokeWidth={2.2} aria-hidden="true" />
                Sign in
              </>
            )}
          </button>

          <p className="mt-6 text-center text-base text-[var(--color-neutral-600)]">
            Don't have an account?{' '}
            <Link
              to="/register"
              className="font-semibold text-[var(--color-primary-700)] underline-offset-2 hover:underline"
            >
              Create one
            </Link>
          </p>
        </form>
      </div>
    </div>
  );
}
