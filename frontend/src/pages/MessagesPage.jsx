// MessagesPage — overview of conversations.
// Backed by the appointments list (chat is per-appointment in this app).
// Tapping a row opens AppointmentDetailPage which has the full chat.

import { useEffect, useState } from 'react';
import { Link } from 'react-router-dom';
import { MessageCircle } from 'lucide-react';
import { useAuth } from '../auth/AuthContext';
import { appointments } from '../api/client';
import StatusBadge from '../components/StatusBadge';

export default function MessagesPage() {
  const { user } = useAuth();
  const [items, setItems] = useState(null);
  const [error, setError] = useState('');

  useEffect(() => {
    appointments.list()
      .then((res) => {
        // Hide cancelled — those conversations are closed.
        const list = (res.data || []).filter((a) => a.status !== 'cancelled');
        setItems(list);
      })
      .catch((err) => setError(err.message));
  }, []);

  return (
    <div>
      <header className="mb-8">
        <h1 className="text-3xl font-bold tracking-tight text-[var(--color-neutral-900)]">
          Messages
        </h1>
        <p className="mt-2 text-lg text-[var(--color-neutral-600)]">
          Chats are organized by appointment. Pick one to open the conversation.
        </p>
      </header>

      {error && <p className="alert alert-error mb-6">{error}</p>}

      {items === null && !error && (
        <div className="space-y-3">
          {[0, 1].map((i) => (
            <div key={i} className="h-20 animate-pulse rounded-xl bg-[var(--color-neutral-100)]" />
          ))}
        </div>
      )}

      {items && items.length === 0 && (
        <div className="rounded-xl border border-dashed border-[var(--color-border-strong)] bg-white p-10 text-center">
          <MessageCircle size={32} strokeWidth={2} className="mx-auto text-[var(--color-neutral-400)]" aria-hidden="true" />
          <p className="mt-4 text-lg font-semibold text-[var(--color-neutral-900)]">
            No conversations yet
          </p>
          <p className="mt-2 text-base text-[var(--color-neutral-600)]">
            Once an appointment is scheduled, you can chat about it here.
          </p>
        </div>
      )}

      {items && items.length > 0 && (
        <ul className="space-y-3">
          {items.map((a) => {
            const counterparty = user?.role === 'caregiver'
              ? `${a.receiver_first_name || ''} ${a.receiver_last_name || ''}`.trim() || 'Care receiver'
              : (a.caregiver_first_name && a.caregiver_last_name)
                ? `${a.caregiver_first_name} ${a.caregiver_last_name}`
                : 'Awaiting caregiver';
            return (
              <li key={a.appointment_id}>
                <Link
                  to={`/appointments/${a.appointment_id}`}
                  className="flex items-start justify-between gap-4 rounded-xl border border-[var(--color-border)] bg-white p-5 transition hover:border-[var(--color-primary-300)] hover:shadow-md"
                >
                  <div className="min-w-0">
                    <div className="text-lg font-semibold text-[var(--color-neutral-900)]">
                      {counterparty}
                    </div>
                    <div className="mt-1 text-base text-[var(--color-neutral-500)]">
                      {new Date(a.start_time).toLocaleString(undefined, {
                        weekday: 'long',
                        month: 'short',
                        day: 'numeric',
                        hour: 'numeric',
                        minute: '2-digit',
                      })}
                    </div>
                  </div>
                  <StatusBadge status={a.status} size="sm" />
                </Link>
              </li>
            );
          })}
        </ul>
      )}
    </div>
  );
}
