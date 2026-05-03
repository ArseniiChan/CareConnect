// StatusBadge — appointment.status indicator.
//
// Labels rewritten for elderly clarity. "Requested" used to mean nothing
// to a 78-year-old — they'd ask their daughter "did it work? Is somebody
// coming?" The new labels answer that question on the badge itself.
//
// Color choices (per index.css palette):
//   requested  → primary blue   (calm, neutral, "waiting")
//   scheduled  → teal/success   (healing color — kinder than bright green)
//   completed  → neutral grey   (done, no longer demanding attention)
//   cancelled  → amber/warning  (NOT red — older users find red alarming)
//
// We pair color with text label and an icon shape (filled dot) so users
// who can't distinguish colors (~8% of men, ~0.5% of women) still parse
// the state. Color alone is never load-bearing.

import { CircleDot, CalendarCheck, CheckCircle2, XCircle } from 'lucide-react';

const STYLES = {
  requested: {
    label: 'Looking for caregiver',
    Icon: CircleDot,
    bg: 'bg-[hsl(205,79%,95%)]',
    text: 'text-[hsl(205,87%,27%)]',
    ring: 'ring-[hsl(205,80%,88%)]',
  },
  scheduled: {
    label: 'Caregiver confirmed',
    Icon: CalendarCheck,
    bg: 'bg-[hsl(165,67%,95%)]',
    text: 'text-[hsl(176,67%,26%)]',
    ring: 'ring-[hsl(165,70%,87%)]',
  },
  completed: {
    label: 'Visit complete',
    Icon: CheckCircle2,
    bg: 'bg-[hsl(212,33%,92%)]',
    text: 'text-[hsl(209,34%,30%)]',
    ring: 'ring-[hsl(210,31%,84%)]',
  },
  cancelled: {
    label: 'Cancelled',
    Icon: XCircle,
    bg: 'bg-[hsl(45,100%,95%)]',
    text: 'text-[hsl(28,73%,26%)]',
    ring: 'ring-[hsl(43,96%,89%)]',
  },
};

export default function StatusBadge({ status, size = 'md' }) {
  const style = STYLES[status] || STYLES.completed;
  const { label, Icon } = style;

  const sizeClass = size === 'sm'
    ? 'text-sm px-2.5 py-0.5'
    : 'text-base px-3 py-1';
  const iconSize = size === 'sm' ? 14 : 16;

  return (
    <span
      className={`inline-flex shrink-0 items-center gap-1.5 rounded-full ring-1 font-semibold ${sizeClass} ${style.bg} ${style.text} ${style.ring}`}
      role="status"
      aria-label={`Status: ${label}`}
    >
      <Icon size={iconSize} strokeWidth={2.25} aria-hidden="true" />
      {label}
    </span>
  );
}
