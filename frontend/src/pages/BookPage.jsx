// BookPage — care receiver creates a new appointment.
//
// Handles the "newly registered user has no address" prerequisite: form
// either picks a saved address or creates one inline. Result: one
// /addresses + one /appointments call, no second-screen surprise.
//
// Older-user choices:
//   - One column, one decision per "step" (where → when → notes)
//   - Address as selectable cards, not a hidden dropdown
//   - Native date / time inputs (familiar, OS-styled, big touch targets)
//   - Long-form button copy ("Book this appointment") not "Submit"
//   - Prominent error region, retry-friendly

import { useEffect, useState } from 'react';
import { useNavigate } from 'react-router-dom';
import { MapPin, Calendar as CalIcon, NotebookPen, CheckCircle2 } from 'lucide-react';
import { addresses, appointments } from '../api/client';

function formatDateForInput(date) {
  const year = date.getFullYear();
  const month = String(date.getMonth() + 1).padStart(2, '0');
  const day = String(date.getDate()).padStart(2, '0');
  return `${year}-${month}-${day}`;
}

function formatTimeForInput(date) {
  const hours = String(date.getHours()).padStart(2, '0');
  const minutes = String(date.getMinutes()).padStart(2, '0');
  return `${hours}:${minutes}`;
}

function buildInitialFormState() {
  const now = new Date();
  const start = new Date(now.getTime() + 60 * 60 * 1000);
  const end = new Date(start.getTime() + 2 * 60 * 60 * 1000);

  return {
    nickname: 'Home',
    addressLine1: '',
    city: '',
    state: 'NY',
    zipCode: '',
    startDate: formatDateForInput(start),
    startTime: formatTimeForInput(start),
    endTime: formatTimeForInput(end),
    notes: '',
  };
}

export default function BookPage() {
  const navigate = useNavigate();

  const [savedAddresses, setSavedAddresses] = useState(null);
  const [selected, setSelected] = useState(null);
  const [form, setForm] = useState(buildInitialFormState);
  const [submitting, setSubmitting] = useState(false);
  const [error, setError] = useState('');

  useEffect(() => {
    addresses.list()
      .then((res) => {
        const list = res.data || [];
        setSavedAddresses(list);
        setSelected(list[0]?.address_id || 'new');
      })
      .catch((err) => setError(err.message));
  }, []);

  function update(field, value) {
    setForm((p) => ({ ...p, [field]: value }));
  }

  async function handleSubmit(e) {
    e.preventDefault();
    setError('');
    setSubmitting(true);
    try {
      let addressId = selected;
      if (selected === 'new' || !selected) {
        const created = await addresses.create({
          nickname: form.nickname || 'Home',
          addressLine1: form.addressLine1,
          city: form.city,
          state: form.state,
          zipCode: form.zipCode,
          isPrimary: (savedAddresses || []).length === 0,
        });
        addressId = created.data.address_id;
      }
      const start = new Date(`${form.startDate}T${form.startTime}:00`);
      let end = new Date(`${form.startDate}T${form.endTime}:00`);
      if (end.getTime() <= start.getTime()) {
        end = new Date(end.getTime() + 24 * 60 * 60 * 1000);
      }
      const startIso = start.toISOString();
      const endIso = end.toISOString();

      const res = await appointments.create({
        addressId,
        startTime: startIso,
        endTime: endIso,
        notes: form.notes,
      });
      navigate(`/appointments/${res.data.appointment_id}`);
    } catch (err) {
      setError(err.message || 'We could not book your appointment. Please try again.');
    } finally {
      setSubmitting(false);
    }
  }

  const usingNew = selected === 'new' || (savedAddresses && savedAddresses.length === 0);

  return (
    <div className="mx-auto max-w-2xl">
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-neutral-900)]">
          Book Care
        </h1>
        <p className="mt-2 text-lg text-[var(--color-neutral-600)]">
          Tell us where, when, and what you need help with.
        </p>
      </header>

      <form onSubmit={handleSubmit} className="space-y-8">
        {/* ── Step: address ────────────────────────────────────── */}
        <FieldGroup
          icon={MapPin}
          title="Where will the visit take place?"
        >
          {savedAddresses === null && (
            <div className="h-12 animate-pulse rounded-md bg-[var(--color-neutral-100)]" />
          )}

          {savedAddresses && savedAddresses.length > 0 && (
            <div className="space-y-3">
              {savedAddresses.map((a) => (
                <SelectableCard
                  key={a.address_id}
                  selected={selected === a.address_id}
                  onClick={() => setSelected(a.address_id)}
                  title={a.nickname || 'Saved address'}
                  body={`${a.address_line1}, ${a.city}, ${a.state} ${a.zip_code}`}
                />
              ))}
              <SelectableCard
                selected={selected === 'new'}
                onClick={() => setSelected('new')}
                title="Use a different address"
                body="Enter a new address below."
              />
            </div>
          )}

          {usingNew && (
            <div className="mt-4 grid grid-cols-1 gap-4 sm:grid-cols-2">
              <div className="sm:col-span-2">
                <label htmlFor="addr1" className="field-label">Street address</label>
                <input id="addr1" className="input" value={form.addressLine1} onChange={(e) => update('addressLine1', e.target.value)} required autoComplete="street-address" />
              </div>
              <div>
                <label htmlFor="city" className="field-label">City</label>
                <input id="city" className="input" value={form.city} onChange={(e) => update('city', e.target.value)} required autoComplete="address-level2" />
              </div>
              <div>
                <label htmlFor="state" className="field-label">State</label>
                <input id="state" className="input" value={form.state} onChange={(e) => update('state', e.target.value)} required autoComplete="address-level1" />
              </div>
              <div className="sm:col-span-2">
                <label htmlFor="zip" className="field-label">ZIP code</label>
                <input id="zip" className="input" value={form.zipCode} onChange={(e) => update('zipCode', e.target.value)} required autoComplete="postal-code" inputMode="numeric" />
              </div>
            </div>
          )}
        </FieldGroup>

        {/* ── Step: when ───────────────────────────────────────── */}
        <FieldGroup icon={CalIcon} title="When do you need care?">
          <div className="grid grid-cols-1 gap-4 sm:grid-cols-3">
            <div>
              <label htmlFor="date" className="field-label">Date</label>
              <input id="date" type="date" className="input" value={form.startDate} onChange={(e) => update('startDate', e.target.value)} required />
            </div>
            <div>
              <label htmlFor="start" className="field-label">Start time</label>
              <input id="start" type="time" className="input" value={form.startTime} onChange={(e) => update('startTime', e.target.value)} required />
            </div>
            <div>
              <label htmlFor="end" className="field-label">End time</label>
              <input id="end" type="time" className="input" value={form.endTime} onChange={(e) => update('endTime', e.target.value)} required />
            </div>
          </div>
        </FieldGroup>

        {/* ── Step: notes ──────────────────────────────────────── */}
        <FieldGroup icon={NotebookPen} title="What do you need help with?">
          <label htmlFor="notes" className="field-label">
            Notes for the caregiver
            <span className="ml-1.5 text-sm font-normal text-[var(--color-neutral-500)]">(optional)</span>
          </label>
          <textarea
            id="notes"
            className="input"
            rows={4}
            value={form.notes}
            onChange={(e) => update('notes', e.target.value)}
          />
          <p className="field-hint">
            For example: mobility assistance, medication reminders, light housekeeping.
          </p>
        </FieldGroup>

        {/* ── Errors + submit ──────────────────────────────────── */}
        <div role="alert" aria-live="polite">
          {error && <p className="alert alert-error">{error}</p>}
        </div>

        <button
          type="submit"
          disabled={submitting}
          className="btn btn-primary btn-lg w-full"
        >
          {submitting ? (
            'Booking your appointment…'
          ) : (
            <>
              <CheckCircle2 size={20} strokeWidth={2.2} aria-hidden="true" />
              Book this appointment
            </>
          )}
        </button>
      </form>
    </div>
  );
}

function FieldGroup({ icon: Icon, title, children }) {
  return (
    <fieldset className="card">
      <legend className="mb-4 flex items-center gap-2 text-lg font-bold text-[var(--color-neutral-900)]">
        <Icon size={20} strokeWidth={2.2} className="text-[var(--color-primary-600)]" aria-hidden="true" />
        {title}
      </legend>
      {children}
    </fieldset>
  );
}

function SelectableCard({ selected, onClick, title, body }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={selected}
      className={`flex w-full items-start gap-4 rounded-lg border-2 p-4 text-left transition ${
        selected
          ? 'border-[var(--color-primary-500)] bg-[var(--color-primary-50)]'
          : 'border-[var(--color-border)] bg-white hover:border-[var(--color-neutral-400)]'
      }`}
    >
      <span className={`mt-1 flex h-5 w-5 shrink-0 items-center justify-center rounded-full border-2 ${
        selected ? 'border-[var(--color-primary-600)] bg-[var(--color-primary-600)]' : 'border-[var(--color-border-strong)]'
      }`} aria-hidden="true">
        {selected && <span className="h-2 w-2 rounded-full bg-white" />}
      </span>
      <span className="block min-w-0">
        <span className="block text-base font-semibold text-[var(--color-neutral-900)]">{title}</span>
        <span className="mt-0.5 block text-base text-[var(--color-neutral-600)]">{body}</span>
      </span>
    </button>
  );
}
