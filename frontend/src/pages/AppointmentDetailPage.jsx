// AppointmentDetailPage — the demo's most important screen.
// Status, lifecycle actions (Accept / Mark complete / Cancel), and the
// per-appointment chat all live here.
//
// Older-user / a11y choices:
//   - Counterparty name as the page title — orientation
//   - Address + time always visible — no "click to expand" mystery meat
//   - Action buttons are large, labeled with verbs ("Accept this request",
//     "Mark complete", "Cancel"), color-paired with state, not color-only
//   - Cancel uses a confirmation prompt — destructive action gating
//   - Chat polls every 3s; messages have role-distinct bubbles + timestamps
//   - Empty chat state has a one-line invite ("Say hi.")

import { useEffect, useState, useRef } from 'react';
import { useParams, Link } from 'react-router-dom';
import { ChevronLeft, Send, MapPin, Clock, MessageCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { appointments, messages as messagesApi } from '../api/client';
import StatusBadge from '../components/StatusBadge';
import Avatar from '../components/Avatar';

const POLL_MS = 3000;

export default function AppointmentDetailPage() {
  const { id } = useParams();
  const { user } = useAuth();

  const [appt, setAppt] = useState(null);
  const [msgs, setMsgs] = useState([]);
  const [error, setError] = useState('');
  const [draft, setDraft] = useState('');
  const [sending, setSending] = useState(false);
  const [actionPending, setActionPending] = useState(null);
  const messagesEndRef = useRef(null);

  // Poll appt + messages while the page is mounted.
  useEffect(() => {
    let cancelled = false;
    let timer;
    async function tick() {
      try {
        const [aRes, mRes] = await Promise.all([
          appointments.get(id),
          messagesApi.list(id).catch(() => ({ data: [] })),
        ]);
        if (cancelled) return;
        setAppt(aRes.data);
        setMsgs(mRes.data || []);
        setError('');
      } catch (err) {
        if (!cancelled) setError(err.message);
      }
      if (!cancelled) timer = setTimeout(tick, POLL_MS);
    }
    tick();
    return () => { cancelled = true; clearTimeout(timer); };
  }, [id]);

  useEffect(() => {
    messagesEndRef.current?.scrollIntoView({ behavior: 'smooth' });
  }, [msgs.length]);

  async function handleAccept() {
    setActionPending('accept');
    try {
      const res = await appointments.accept(id);
      setAppt(res.data);
    } catch (err) { setError(err.message); }
    finally { setActionPending(null); }
  }

  async function handleComplete() {
    if (!confirm('Mark this appointment as completed? This cannot be undone.')) return;
    setActionPending('complete');
    try {
      const res = await appointments.complete(id);
      setAppt(res.data);
    } catch (err) { setError(err.message); }
    finally { setActionPending(null); }
  }

  async function handleCancel() {
    const reason = prompt('Why are you cancelling? (Required)');
    if (!reason || !reason.trim()) return;
    setActionPending('cancel');
    try {
      const res = await appointments.cancel(id, reason.trim());
      setAppt(res.data);
    } catch (err) { setError(err.message); }
    finally { setActionPending(null); }
  }

  async function handleSend(e) {
    e.preventDefault();
    if (!draft.trim()) return;
    setSending(true);
    try {
      const res = await messagesApi.send(id, draft.trim());
      setMsgs((prev) => [...prev, res.data]);
      setDraft('');
    } catch (err) {
      setError(err.message);
    } finally {
      setSending(false);
    }
  }

  // ── Loading state ─────────────────────────────────────────
  if (!appt && !error) {
    return (
      <div className="mx-auto max-w-3xl">
        <div className="space-y-3">
          <div className="h-8 w-1/3 animate-pulse rounded bg-[var(--color-neutral-100)]" />
          <div className="h-40 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
        </div>
      </div>
    );
  }

  // ── Hard error state ──────────────────────────────────────
  if (!appt && error) {
    return (
      <div className="mx-auto max-w-2xl">
        <div className="alert alert-error">{error}</div>
        <Link to="/appointments" className="btn btn-secondary mt-5">
          <ChevronLeft size={18} aria-hidden="true" />
          Back to my appointments
        </Link>
      </div>
    );
  }

  const isCaregiver = user?.role === 'caregiver';
  const isReceiver = user?.role === 'care_receiver';
  const isAssigned = isCaregiver && appt.caregiver_id === user.id;
  const isOpenRequest = appt.status === 'requested' && !appt.caregiver_id;
  const canAccept = isCaregiver && isOpenRequest;
  const canComplete = isAssigned && appt.status === 'scheduled';
  const canCancel =
    (isReceiver && (appt.status === 'requested' || appt.status === 'scheduled')) ||
    (isAssigned && appt.status === 'scheduled');

  const counterparty = isCaregiver
    ? `${appt.receiver_first_name || ''} ${appt.receiver_last_name || ''}`.trim() || 'Care receiver'
    : (appt.caregiver_first_name && appt.caregiver_last_name)
      ? `${appt.caregiver_first_name} ${appt.caregiver_last_name}`
      : 'Looking for a caregiver';
  const hasPerson = !counterparty.startsWith('Looking');

  return (
    <div className="mx-auto max-w-3xl">
      <Link
        to="/"
        className="mb-6 inline-flex h-10 items-center gap-1 rounded-md text-base font-semibold text-[var(--color-primary-700)] hover:underline"
      >
        <ChevronLeft size={18} strokeWidth={2.2} aria-hidden="true" />
        Back to home
      </Link>

      {/* ── Detail card ───────────────────────────────────────── */}
      <div className="card mb-6">
        <div className="mb-5 flex items-start justify-between gap-4">
          <div className="flex items-center gap-4">
            {hasPerson ? (
              <Avatar name={counterparty} size={56} />
            ) : (
              <span
                className="inline-flex h-14 w-14 shrink-0 items-center justify-center rounded-full border-2 border-dashed border-[var(--color-border-strong)] text-[var(--color-neutral-400)]"
                aria-hidden="true"
              >
                <ChevronLeft size={22} strokeWidth={2} className="rotate-180" />
              </span>
            )}
            <div>
              <h1 className="text-2xl font-bold tracking-tight text-[var(--color-neutral-900)]">
                {counterparty}
              </h1>
              <p className="mt-1 text-base text-[var(--color-neutral-500)]">
                {isCaregiver ? 'Care receiver' : 'Caregiver'}
              </p>
            </div>
          </div>
          <StatusBadge status={appt.status} />
        </div>

        <dl className="space-y-3 border-t border-[var(--color-border)] pt-5">
          <DetailRow icon={Clock} label="When">
            {fmtDateTime(appt.start_time, appt.end_time)}
          </DetailRow>
          {appt.address_line1 && (
            <DetailRow icon={MapPin} label="Where">
              {appt.address_line1}
              {appt.city && `, ${appt.city}`}
              {appt.state && `, ${appt.state}`}
              {appt.zip_code && ` ${appt.zip_code}`}
            </DetailRow>
          )}
          {appt.notes && (
            <DetailRow label="Notes">
              {appt.notes}
            </DetailRow>
          )}
        </dl>

        {appt.cancelled_reason && (
          <p className="alert alert-warning mt-5">
            <span><span className="font-semibold">Cancelled:</span> {appt.cancelled_reason}</span>
          </p>
        )}

        {/* Reassurance — care receivers see "is someone coming?" anxiety
            most acutely while a request is unassigned. Naming what's
            happening helps. */}
        {isReceiver && appt.status === 'requested' && !appt.cancelled_reason && (
          <p className="alert alert-info mt-5">
            <span>
              <span className="font-semibold">We're notifying verified caregivers in your area.</span>{' '}
              Most requests are accepted within a few hours. You'll see their name and details here as soon as someone confirms.
            </span>
          </p>
        )}

        {error && <p className="alert alert-error mt-5">{error}</p>}

        {/* ── Lifecycle actions ───────────────────────────────── */}
        {(canAccept || canComplete || canCancel) && (
          <div className="mt-6 flex flex-wrap gap-3">
            {canAccept && (
              <button
                onClick={handleAccept}
                disabled={!!actionPending}
                className="btn btn-primary btn-lg"
              >
                {actionPending === 'accept' ? 'Accepting…' : 'Accept this request'}
              </button>
            )}
            {canComplete && (
              <button
                onClick={handleComplete}
                disabled={!!actionPending}
                className="btn btn-primary btn-lg"
              >
                {actionPending === 'complete' ? 'Completing…' : 'Mark complete'}
              </button>
            )}
            {canCancel && (
              <button
                onClick={handleCancel}
                disabled={!!actionPending}
                className="btn btn-danger"
              >
                {actionPending === 'cancel' ? 'Cancelling…' : 'Cancel appointment'}
              </button>
            )}
          </div>
        )}
      </div>

      {/* ── Chat ──────────────────────────────────────────────── */}
      {(appt.status === 'scheduled' || appt.status === 'completed' || msgs.length > 0) && (
        <section className="card overflow-hidden p-0">
          <header className="flex items-center gap-2 border-b border-[var(--color-border)] px-6 py-4">
            <MessageCircle size={20} strokeWidth={2.2} className="text-[var(--color-primary-600)]" aria-hidden="true" />
            <h2 className="text-lg font-bold text-[var(--color-neutral-900)]">In-app chat</h2>
          </header>

          <div className="max-h-[26rem] space-y-3 overflow-y-auto px-6 py-5">
            {msgs.length === 0 && (
              <p className="text-center text-base text-[var(--color-neutral-500)]">
                No messages yet. Say hi.
              </p>
            )}
            {msgs.map((m) => {
              const mine = m.sender_id === user?.id;
              return (
                <div key={m.message_id} className={`flex ${mine ? 'justify-end' : 'justify-start'}`}>
                  <div
                    className={`max-w-[80%] rounded-2xl px-4 py-2.5 text-base ${
                      mine
                        ? 'bg-[var(--color-primary-600)] text-white'
                        : 'bg-[var(--color-neutral-100)] text-[var(--color-neutral-900)]'
                    }`}
                  >
                    <p className="leading-snug">{m.message_text}</p>
                    <p className={`mt-1 text-xs ${mine ? 'text-[hsl(205,80%,88%)]' : 'text-[var(--color-neutral-500)]'}`}>
                      {new Date(m.sent_at).toLocaleTimeString(undefined, { hour: 'numeric', minute: '2-digit' })}
                    </p>
                  </div>
                </div>
              );
            })}
            <div ref={messagesEndRef} />
          </div>

          {appt.status !== 'completed' && appt.status !== 'cancelled' && (
            <form onSubmit={handleSend} className="flex gap-2 border-t border-[var(--color-border)] p-4">
              <label htmlFor="msg" className="sr-only">Message</label>
              <input
                id="msg"
                type="text"
                value={draft}
                onChange={(e) => setDraft(e.target.value)}
                placeholder="Type a message…"
                disabled={sending}
                className="input flex-1"
              />
              <button
                type="submit"
                disabled={sending || !draft.trim()}
                className="btn btn-primary"
                aria-label="Send message"
              >
                <Send size={18} strokeWidth={2.2} aria-hidden="true" />
                <span className="hidden sm:inline">Send</span>
              </button>
            </form>
          )}
        </section>
      )}
    </div>
  );
}

function DetailRow({ icon: Icon, label, children }) {
  return (
    <div className="flex gap-3">
      <dt className="flex w-24 shrink-0 items-start gap-1.5 text-base text-[var(--color-neutral-500)]">
        {Icon && <Icon size={18} strokeWidth={2} className="mt-0.5" aria-hidden="true" />}
        {label}
      </dt>
      <dd className="text-base text-[var(--color-neutral-900)]">{children}</dd>
    </div>
  );
}

function fmtDateTime(startIso, endIso) {
  const start = new Date(startIso);
  const end = new Date(endIso);
  const dateOpts = { weekday: 'long', month: 'long', day: 'numeric' };
  const timeOpts = { hour: 'numeric', minute: '2-digit' };
  return `${start.toLocaleDateString(undefined, dateOpts)} · ${start.toLocaleTimeString(undefined, timeOpts)} – ${end.toLocaleTimeString(undefined, timeOpts)}`;
}
