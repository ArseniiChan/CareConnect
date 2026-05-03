// Logo — CareConnect's brand mark.
//
// A heart inside a soft house silhouette. Two readings:
//   1. House = home care (where the visit happens)
//   2. Heart = the relationship between caregiver and care receiver
// Single-stroke, single-color, currentColor-driven so it works on light
// and dark backgrounds without per-page color overrides.
//
// Designed at 24×24 viewBox so it composes 1:1 with lucide-react icons
// already in the app. Stroke widths match lucide's default 2 for visual
// continuity.
//
// Usage:
//   <Logo />                                  fits 24×24, currentColor
//   <Logo size={40} />                        explicit pixel size
//   <Logo size={48} className="text-primary-700" />
//   <LogoLockup size={32} />                  glyph + wordmark side-by-side

export function LogoMark({ size = 24, className = '', title = 'CareConnect' }) {
  return (
    <svg
      width={size}
      height={size}
      viewBox="0 0 24 24"
      fill="none"
      xmlns="http://www.w3.org/2000/svg"
      role="img"
      aria-label={title}
      className={className}
    >
      {/* House — rounded, warm. Subtle tinted fill so the heart pops. */}
      <path
        d="M3.5 11 L12 3.5 L20.5 11 V19.5 a1.5 1.5 0 0 1 -1.5 1.5 H5 a1.5 1.5 0 0 1 -1.5 -1.5 Z"
        fill="currentColor"
        fillOpacity="0.12"
      />
      <path
        d="M3.5 11 L12 3.5 L20.5 11 V19.5 a1.5 1.5 0 0 1 -1.5 1.5 H5 a1.5 1.5 0 0 1 -1.5 -1.5 Z"
        stroke="currentColor"
        strokeWidth="1.75"
        strokeLinejoin="round"
        strokeLinecap="round"
      />
      {/* Heart — solid fill, slightly off-center down so it sits visually
          centered inside the house body (not the whole house+roof). */}
      <path
        d="M12 17.6 L8.6 14.6 a2.1 2.1 0 0 1 0 -2.9 a2.1 2.1 0 0 1 3 0 L12 11.8 L12.4 11.7 a2.1 2.1 0 0 1 3 0 a2.1 2.1 0 0 1 0 2.9 Z"
        fill="currentColor"
      />
    </svg>
  );
}

/**
 * LogoLockup — mark + wordmark, sized as a unit. Use this in headers,
 * auth pages, and anywhere the brand needs to read at a glance.
 *
 * Glyph and wordmark scale together. Wordmark uses a tighter tracking
 * than body text — Refactoring UI: tighter letterspacing reads as
 * "intentional" at display sizes.
 */
export function LogoLockup({ size = 28, className = '' }) {
  // Wordmark roughly 1.4× the glyph height feels balanced to the eye.
  const fontSize = Math.round(size * 1.0);
  return (
    <span className={`inline-flex items-center gap-2 ${className}`}>
      <LogoMark size={size} className="text-[var(--color-primary-600)]" />
      <span
        className="font-bold text-[var(--color-neutral-900)]"
        style={{ fontSize: `${fontSize}px`, letterSpacing: '-0.025em', lineHeight: 1 }}
      >
        CareConnect
      </span>
    </span>
  );
}

// Default export for convenience: the full lockup.
export default LogoLockup;
