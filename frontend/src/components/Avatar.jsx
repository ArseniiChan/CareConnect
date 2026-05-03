// Avatar — deterministic initials avatar.
//
// Why: appointment cards used to read "Maria Garcia, Friday May 15, 9 AM"
// — a list of facts. Putting a face (or its proxy: initials in a colored
// disc) before the name turns "a service" into "a person you booked."
// Care is parasocial — humanize the cards, not just the booking flow.
//
// We don't have user-uploaded photos yet, so we generate a stable color
// from the name and render initials. Once we add profile photos to the
// API, this component grows an `imageUrl` prop and falls back to initials
// only when the URL is missing or fails to load.

const PALETTE = [
  // Hand-picked from our HSL design tokens — saturated enough to look
  // intentional, dark enough that white text reads at WCAG AA on top.
  ['hsl(205, 76%, 39%)', 'white'],   // primary blue
  ['hsl(174, 65%, 32%)', 'white'],   // success teal
  ['hsl(32, 79%, 38%)',  'white'],   // warning amber-deep
  ['hsl(356, 75%, 42%)', 'white'],   // danger muted red
  ['hsl(280, 50%, 40%)', 'white'],   // plum (off-palette, used sparingly)
  ['hsl(220, 40%, 30%)', 'white'],   // navy
];

function pickColor(name) {
  // Sum the char codes — fast, deterministic, gives a stable color per name.
  let sum = 0;
  for (let i = 0; i < name.length; i++) sum = (sum + name.charCodeAt(i)) % 1000;
  return PALETTE[sum % PALETTE.length];
}

function initialsOf(name) {
  if (!name) return '?';
  const parts = name.trim().split(/\s+/);
  if (parts.length === 1) return parts[0][0]?.toUpperCase() || '?';
  return (parts[0][0] + parts[parts.length - 1][0]).toUpperCase();
}

export default function Avatar({ name, size = 40, imageUrl, className = '' }) {
  const safeName = name || '';
  const [bg, fg] = pickColor(safeName);
  const initials = initialsOf(safeName);

  // Font size scales with avatar size — keeps initials looking right at
  // any size from 24 (inline list) to 80 (profile hero).
  const fontSize = Math.round(size * 0.42);

  // imageUrl path: when we add real photos, render the img and let it
  // fall back to initials via onError.
  if (imageUrl) {
    return (
      <span
        className={`relative inline-flex shrink-0 items-center justify-center overflow-hidden rounded-full ${className}`}
        style={{ width: size, height: size, background: bg, color: fg, fontSize }}
        aria-hidden="true"
      >
        <img
          src={imageUrl}
          alt=""
          width={size}
          height={size}
          className="absolute inset-0 h-full w-full object-cover"
          onError={(e) => { e.currentTarget.style.display = 'none'; }}
        />
        <span className="font-semibold">{initials}</span>
      </span>
    );
  }

  return (
    <span
      className={`inline-flex shrink-0 items-center justify-center rounded-full font-semibold ${className}`}
      style={{ width: size, height: size, background: bg, color: fg, fontSize }}
      aria-hidden="true"
    >
      {initials}
    </span>
  );
}
