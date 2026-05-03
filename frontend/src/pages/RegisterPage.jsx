// RegisterPage — two-step sign-up.
//
// Step 1: pick role with large card-style buttons (selectable cards >
// radio buttons for older users — Refactoring UI's "Think outside the box").
// Step 2: collect details. Form fields tuned for older-user comfort:
//   - All labels above inputs (no placeholder-as-label)
//   - h-12 inputs, h-14 primary submit
//   - Optional fields explicitly marked "(optional)" — older users find
//     ambiguity stressful
//   - aria-live error region

import { useState } from 'react';
import { useNavigate, Link } from 'react-router-dom';
import { Heart, HandHelping, ChevronLeft } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { LogoLockup } from '../components/Logo';

export default function RegisterPage() {
  const navigate = useNavigate();
  const { register } = useAuth();

  const [step, setStep] = useState(1);
  const [role, setRole] = useState(null);
  const [form, setForm] = useState({
    email: '', password: '', firstName: '', lastName: '',
    phone: '', birthday: '', sex: '',
  });
  const [error, setError] = useState('');
  const [submitting, setSubmitting] = useState(false);

  function update(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      const payload = {
        email: form.email,
        password: form.password,
        firstName: form.firstName,
        lastName: form.lastName,
        role,
      };
      if (form.phone) payload.phone = form.phone;
      if (role === 'care_receiver') {
        if (form.birthday) payload.birthday = form.birthday;
        if (form.sex) payload.sex = form.sex;
      }
      await register(payload);
      navigate('/', { replace: true });
    } catch (err) {
      setError(err.message || 'We could not create your account. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  return (
    <div className="flex min-h-screen items-center justify-center px-4 py-10">
      <div className="w-full max-w-md">
        <div className="mb-8 flex items-center justify-center">
          <LogoLockup size={36} />
        </div>

        <div className="card">
          {step === 1 && (
            <>
              <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--color-neutral-900)]">
                Welcome to CareConnect
              </h1>
              <p className="mb-6 text-base text-[var(--color-neutral-600)]">
                Are you looking for care, or providing it?
              </p>

              <div className="space-y-3">
                <RoleCard
                  icon={Heart}
                  title="I need care"
                  description="Book caregivers for yourself or a loved one."
                  onClick={() => { setRole('care_receiver'); setStep(2); }}
                />
                <RoleCard
                  icon={HandHelping}
                  title="I'm a caregiver"
                  description="Accept jobs and manage your schedule."
                  onClick={() => { setRole('caregiver'); setStep(2); }}
                />
              </div>

              <p className="mt-6 text-center text-base text-[var(--color-neutral-600)]">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-semibold text-[var(--color-primary-700)] underline-offset-2 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </>
          )}

          {step === 2 && (
            <form onSubmit={handleSubmit}>
              <button
                type="button"
                onClick={() => setStep(1)}
                className="mb-4 inline-flex h-10 items-center gap-1 rounded-md text-base font-semibold text-[var(--color-primary-700)] hover:underline"
              >
                <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
                Back
              </button>

              <h1 className="mb-2 text-2xl font-bold tracking-tight text-[var(--color-neutral-900)]">
                Create your account
              </h1>
              <p className="mb-6 text-base text-[var(--color-neutral-600)]">
                Signing up as{' '}
                <span className="font-semibold text-[var(--color-neutral-900)]">
                  {role === 'caregiver' ? 'a caregiver' : 'a care receiver'}
                </span>.
              </p>

              <div className="grid grid-cols-2 gap-4">
                <Field id="firstName" label="First name" value={form.firstName} onChange={(v) => update('firstName', v)} required />
                <Field id="lastName" label="Last name" value={form.lastName} onChange={(v) => update('lastName', v)} required />
              </div>
              <Field id="email" label="Email address" type="email" value={form.email} onChange={(v) => update('email', v)} required autoComplete="email" />
              <Field id="password" label="Password" type="password" value={form.password} onChange={(v) => update('password', v)} required autoComplete="new-password" hint="At least 8 characters." />
              <Field id="phone" label="Phone" optional value={form.phone} onChange={(v) => update('phone', v)} autoComplete="tel" />

              {role === 'care_receiver' && (
                <>
                  <Field
                    id="birthday"
                    label="Date of birth"
                    optional
                    type="date"
                    value={form.birthday}
                    onChange={(v) => update('birthday', v)}
                    max={new Date().toISOString().split('T')[0]}
                  />
                  <SelectField
                    id="sex"
                    label="Sex"
                    optional
                    value={form.sex}
                    onChange={(v) => update('sex', v)}
                    options={[
                      { value: '', label: 'Prefer not to say' },
                      { value: 'female', label: 'Female' },
                      { value: 'male', label: 'Male' },
                      { value: 'other', label: 'Other' },
                    ]}
                  />
                </>
              )}

              <div role="alert" aria-live="polite" className={error ? 'mt-4' : ''}>
                {error && <p className="alert alert-error">{error}</p>}
              </div>

              <button
                type="submit"
                disabled={submitting}
                className="btn btn-primary btn-lg mt-6 w-full"
              >
                {submitting ? 'Creating account…' : 'Create account'}
              </button>

              <p className="mt-6 text-center text-base text-[var(--color-neutral-600)]">
                Already have an account?{' '}
                <Link
                  to="/login"
                  className="font-semibold text-[var(--color-primary-700)] underline-offset-2 hover:underline"
                >
                  Sign in
                </Link>
              </p>
            </form>
          )}
        </div>
      </div>
    </div>
  );
}

// Selectable card — bigger, easier to tap than radio.
function RoleCard({ icon: Icon, title, description, onClick }) {
  return (
    <button
      type="button"
      onClick={onClick}
      className="group flex w-full items-start gap-4 rounded-lg border-2 border-[var(--color-border)] bg-white p-4 text-left transition hover:border-[var(--color-primary-500)] hover:bg-[var(--color-primary-50)] focus-visible:border-[var(--color-primary-500)]"
    >
      <span className="flex h-12 w-12 shrink-0 items-center justify-center rounded-full bg-[var(--color-primary-50)] text-[var(--color-primary-700)] transition group-hover:bg-[var(--color-primary-100)]">
        <Icon size={22} strokeWidth={2.2} aria-hidden="true" />
      </span>
      <span className="block">
        <span className="block text-lg font-semibold text-[var(--color-neutral-900)]">{title}</span>
        <span className="mt-0.5 block text-base text-[var(--color-neutral-600)]">{description}</span>
      </span>
    </button>
  );
}

function Field({ id, label, value, onChange, type = 'text', required, optional, autoComplete, hint, max }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="ml-1.5 text-sm font-normal text-[var(--color-neutral-500)]">(optional)</span>}
      </label>
      <input
        id={id}
        type={type}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        required={required}
        autoComplete={autoComplete}
        max={max}
        className="input"
      />
      {hint && <p className="field-hint">{hint}</p>}
    </div>
  );
}

// Constrains free-text fields to a known set of values — better data hygiene
// and one less moment of "what should I type here?" for older users.
function SelectField({ id, label, value, onChange, optional, options }) {
  return (
    <div className="mb-4">
      <label htmlFor={id} className="field-label">
        {label}
        {optional && <span className="ml-1.5 text-sm font-normal text-[var(--color-neutral-500)]">(optional)</span>}
      </label>
      <select
        id={id}
        value={value}
        onChange={(e) => onChange(e.target.value)}
        className="input"
      >
        {options.map((opt) => (
          <option key={opt.value} value={opt.value}>{opt.label}</option>
        ))}
      </select>
    </div>
  );
}
