# CareConnect Theme Usage Guide

## 1. Theme Direction

The CareConnect UI theme is designed to feel:

- Clean
- Clinical
- Trustworthy
- Minimal
- Easy to read
- Similar to Uber's white-space-heavy interface style

The main visual rule is:

```txt
90% white / light gray
8% black text and borders
2% calming green accent
```

The green accent should be used carefully. It should guide the user, not dominate the interface.

Use green for:

- Primary buttons
- Selected navigation states
- Focus rings
- Success badges
- Important positive status indicators

Avoid using green for:

- Large background sections
- Entire cards
- Long text blocks
- Decorative areas with no purpose

---

## 2. Tailwind Dark Mode

Dark mode should follow the user's browser or system preference.

In `tailwind.config.js`, use:

```js
darkMode: "media",
```

This means that Tailwind's `dark:` classes automatically activate when the user's browser or operating system is set to dark mode.

Example:

```jsx
<div className="bg-background text-text dark:bg-background-dark dark:text-text-dark">
  Content
</div>
```

Do not create a manual dark mode toggle unless the product specifically requires one later.

---

## 3. Global CSS Location

The reusable theme classes should live in:

```txt
src/index.css
```

The file should be imported in `main.jsx` or `main.tsx`.

```jsx
import "./index.css";
```

---

## 4. Recommended `index.css`

```css
@tailwind base;
@tailwind components;
@tailwind utilities;

@layer components {
  .app-page {
    @apply min-h-screen bg-background text-text dark:bg-background-dark dark:text-text-dark;
  }

  .app-section {
    @apply bg-surface border border-border rounded-card shadow-soft
           dark:bg-surface-dark dark:border-border-dark dark:shadow-softDark;
  }

  .app-card {
    @apply bg-white border border-border rounded-card shadow-soft p-5
           dark:bg-surface-dark dark:border-border-dark dark:shadow-softDark;
  }

  .app-muted {
    @apply text-muted dark:text-muted-dark;
  }

  .btn-primary {
    @apply bg-green-600 hover:bg-green-700 text-white font-medium px-5 py-3 rounded-app shadow-button transition;
  }

  .btn-secondary {
    @apply bg-white hover:bg-surface-soft text-text border border-border font-medium px-5 py-3 rounded-app transition
           dark:bg-surface-dark dark:hover:bg-surface-darkSoft dark:text-text-dark dark:border-border-dark;
  }

  .input {
    @apply bg-white border border-border text-text placeholder:text-subtle px-4 py-3 rounded-app outline-none
           focus:ring-2 focus:ring-green-200 focus:border-green-500
           dark:bg-surface-dark dark:border-border-dark dark:text-text-dark dark:placeholder:text-subtle-dark
           dark:focus:ring-green-900 dark:focus:border-green-500;
  }

  .badge-success {
    @apply bg-green-50 text-green-700 border border-green-100 rounded-full px-3 py-1 text-sm font-medium
           dark:bg-green-950 dark:text-green-300 dark:border-green-900;
  }
}
```

---

## 5. Theme Colors

```js
colors: {
  background: {
    DEFAULT: "#ffffff",
    dark: "#0b0f0d",
  },

  surface: {
    DEFAULT: "#ffffff",
    soft: "#f8fafc",
    dark: "#111827",
    darkSoft: "#1f2937",
  },

  text: {
    DEFAULT: "#111827",
    dark: "#f9fafb",
  },

  muted: {
    DEFAULT: "#6b7280",
    dark: "#9ca3af",
  },

  subtle: {
    DEFAULT: "#9ca3af",
    dark: "#6b7280",
  },

  border: {
    DEFAULT: "#e5e7eb",
    dark: "#27352f",
  },

  green: {
    50: "#f0fdf4",
    100: "#dcfce7",
    200: "#bbf7d0",
    300: "#86efac",
    400: "#4ade80",
    500: "#22c55e",
    600: "#16a34a",
    700: "#15803d",
    900: "#14532d",
    950: "#052e16",
  },
}
```

---

## 6. Border Radius and Shadows

```js
borderRadius: {
  app: "0.875rem",
  card: "1.25rem",
},

boxShadow: {
  soft: "0 8px 24px rgba(15, 23, 42, 0.06)",
  softDark: "0 8px 24px rgba(0, 0, 0, 0.35)",
  button: "0 4px 12px rgba(34, 197, 94, 0.22)",
},
```

Use:

- `rounded-app` for buttons, inputs, and small UI elements
- `rounded-card` for cards, panels, and containers
- `shadow-soft` for light mode cards
- `dark:shadow-softDark` for dark mode cards
- `shadow-button` only for important primary actions

---

## 7. Using the App Page Wrapper

Every main page should use the `.app-page` background through the shared layout.

Preferred usage:

```jsx
export default function Layout() {
  return (
    <div className="app-page">
      <main>
        <Outlet />
      </main>
    </div>
  );
}
```

Avoid setting page-level background colors manually unless the page has a special design reason.

Do not do this repeatedly on every page:

```jsx
<div className="min-h-screen bg-white dark:bg-black">
```

Use the theme class instead:

```jsx
<div className="app-page">
```

---

## 8. Cards and Panels

Use `.app-card` for standard content blocks.

```jsx
<div className="app-card">
  <h2 className="text-xl font-semibold">Upcoming Appointment</h2>

  <p className="mt-2 app-muted">
    Your next visit is scheduled for Monday at 10:00 AM.
  </p>
</div>
```

Use `.app-section` for larger sections or grouped layout panels.

```jsx
<section className="app-section p-6">
  <h1 className="text-2xl font-semibold">Care Dashboard</h1>
</section>
```

Cards should generally have:

- White background in light mode
- Dark slate background in dark mode
- Subtle border
- Soft shadow
- Comfortable padding

---

## 9. Text Styles

Use strong contrast for important text.

```jsx
<h1 className="text-3xl font-semibold tracking-tight">
  Find trusted care near you
</h1>
```

Use `.app-muted` for secondary text.

```jsx
<p className="app-muted">
  Connect with reliable caregivers in a clean, simple, and secure way.
</p>
```

Use muted text for:

- Descriptions
- Helper text
- Metadata
- Labels
- Timestamps

Do not use muted text for primary actions or important warnings.

---

## 10. Buttons

### Primary Button

Use `.btn-primary` for the main action on a page.

```jsx
<button className="btn-primary">
  Find Care
</button>
```

Examples of primary actions:

- Find Care
- Book Appointment
- Send Message
- Save Changes
- Continue

Each screen should usually have only one primary button.

### Secondary Button

Use `.btn-secondary` for lower-priority actions.

```jsx
<button className="btn-secondary">
  Cancel
</button>
```

Examples of secondary actions:

- Cancel
- Back
- View Details
- Edit Later
- Become a Caregiver

---

## 11. Inputs

Use `.input` for form fields.

```jsx
<input
  className="input w-full"
  placeholder="Search by service or location"
/>
```

For labels:

```jsx
<label className="block text-sm font-medium">
  Email Address
</label>

<input
  className="input mt-2 w-full"
  type="email"
  placeholder="name@example.com"
/>
```

Inputs should:

- Use white backgrounds in light mode
- Use dark surfaces in dark mode
- Have visible borders
- Use green focus rings
- Keep placeholder text subtle

---

## 12. Badges and Status Indicators

Use green badges only for positive or verified states.

```jsx
<span className="badge-success">
  Verified caregiver
</span>
```

Good uses:

- Verified
- Available
- Active
- Completed
- Approved

Do not use green badges for neutral information. Neutral badges should use gray styling.

Example neutral badge:

```jsx
<span className="rounded-full border border-border px-3 py-1 text-sm app-muted dark:border-border-dark">
  Pending
</span>
```

---

## 13. Layout Component

The main app layout should appear on most authenticated or content-heavy pages.

Desktop and tablet screens should use a top navigation bar.

Mobile screens should use a simplified bottom navigation with icons only.

### Navigation Behavior

```txt
Desktop/tablet:
Top navigation with text links

Mobile:
Small top brand header
Bottom fixed icon navigation
```

Use Tailwind breakpoints:

```txt
md:hidden       = show only on mobile
hidden md:block = hide on mobile, show on medium screens and larger
```

---

## 14. Layout Example

```jsx
import { Link, NavLink, Outlet } from "react-router-dom";
import {
  Home,
  Search,
  CalendarDays,
  MessageCircle,
  User,
} from "lucide-react";

const navItems = [
  {
    label: "Home",
    to: "/",
    icon: Home,
  },
  {
    label: "Find Care",
    to: "/caregivers",
    icon: Search,
  },
  {
    label: "Appointments",
    to: "/appointments",
    icon: CalendarDays,
  },
  {
    label: "Messages",
    to: "/messages",
    icon: MessageCircle,
  },
  {
    label: "Profile",
    to: "/profile",
    icon: User,
  },
];

export default function Layout() {
  return (
    <div className="app-page">
      <header className="sticky top-0 z-50 hidden border-b border-border bg-white/90 backdrop-blur dark:border-border-dark dark:bg-background-dark/90 md:block">
        <div className="mx-auto flex h-16 max-w-6xl items-center justify-between px-4">
          <Link to="/" className="text-xl font-semibold tracking-tight">
            CareConnect
          </Link>

          <nav className="flex items-center gap-6 text-sm font-medium">
            {navItems.map((item) => (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "transition",
                    isActive
                      ? "text-green-600 dark:text-green-400"
                      : "text-muted hover:text-text dark:text-muted-dark dark:hover:text-text-dark",
                  ].join(" ")
                }
              >
                {item.label}
              </NavLink>
            ))}
          </nav>
        </div>
      </header>

      <header className="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur dark:border-border-dark dark:bg-background-dark/90 md:hidden">
        <div className="flex h-14 items-center justify-center px-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            CareConnect
          </Link>
        </div>
      </header>

      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-4 pb-24 pt-6 md:pb-8">
        <Outlet />
      </main>

      <nav className="fixed bottom-0 left-0 right-0 z-50 border-t border-border bg-white/95 backdrop-blur dark:border-border-dark dark:bg-background-dark/95 md:hidden">
        <div className="mx-auto grid h-16 max-w-md grid-cols-5 px-2">
          {navItems.map((item) => {
            const Icon = item.icon;

            return (
              <NavLink
                key={item.to}
                to={item.to}
                className={({ isActive }) =>
                  [
                    "flex flex-col items-center justify-center gap-1 rounded-app text-xs font-medium transition",
                    isActive
                      ? "text-green-600 dark:text-green-400"
                      : "text-subtle hover:text-text dark:text-subtle-dark dark:hover:text-text-dark",
                  ].join(" ")
                }
              >
                <Icon size={21} strokeWidth={2.2} />

                <span className="sr-only">
                  {item.label}
                </span>
              </NavLink>
            );
          })}
        </div>
      </nav>
    </div>
  );
}
```

---

## 15. Mobile Navigation Accessibility

Mobile navigation icons should visually hide labels but still keep them available for screen readers.

Use:

```jsx
<span className="sr-only">
  {item.label}
</span>
```

Do not remove labels entirely.

Good:

```jsx
<Home />
<span className="sr-only">Home</span>
```

Bad:

```jsx
<Home />
```

The second version gives screen readers no useful navigation label.

---

## 16. Page Example

```jsx
export default function HomePage() {
  return (
    <section className="space-y-6">
      <div>
        <p className="app-muted text-sm">
          Care made simple
        </p>

        <h1 className="mt-2 text-3xl font-semibold tracking-tight">
          Find trusted caregivers near you
        </h1>

        <p className="mt-3 max-w-2xl app-muted">
          Connect with reliable caregivers in a clean, simple, and secure way.
        </p>
      </div>

      <div className="app-card">
        <h2 className="text-xl font-semibold">
          Start your search
        </h2>

        <p className="mt-2 app-muted">
          Search by location, care type, availability, or certification.
        </p>

        <button className="btn-primary mt-5">
          Find Care
        </button>
      </div>
    </section>
  );
}
```

---

## 17. Page Spacing Rules

Use consistent spacing between sections.

Recommended defaults:

```jsx
<section className="space-y-6">
```

For page content:

```jsx
<main className="mx-auto max-w-6xl px-4 py-6">
```

For cards:

```jsx
<div className="app-card space-y-4">
```

Avoid cramped layouts. The design should feel clean and calm.

---

## 18. When Not to Use the Main Layout

Some pages may not need the full layout.

Examples:

- Login
- Register
- Forgot password
- Landing page experiments
- Error pages
- Invite pages

These pages can use a simpler full-screen layout.

Example:

```jsx
export default function LoginPage() {
  return (
    <main className="app-page flex items-center justify-center px-4">
      <section className="app-card w-full max-w-md">
        <h1 className="text-2xl font-semibold">
          Sign in
        </h1>
      </section>
    </main>
  );
}
```

---

## 19. Do and Don't

### Do

- Use white space generously
- Use green only for meaningful emphasis
- Use `.app-card` for content containers
- Use `.btn-primary` for the main action
- Use `.app-muted` for secondary text
- Use `dark:` classes when creating custom components
- Keep mobile navigation simple

### Don't

- Overuse green
- Use multiple competing primary buttons on one screen
- Create random one-off colors
- Hardcode dark mode colors in page components
- Put large amounts of content inside cramped cards
- Remove accessibility labels from icon-only buttons
- Use shadows too heavily

---

## 20. Quick Component Reference

### Page

```jsx
<div className="app-page">
  Page content
</div>
```

### Card

```jsx
<div className="app-card">
  Card content
</div>
```

### Muted Text

```jsx
<p className="app-muted">
  Secondary text
</p>
```

### Primary Button

```jsx
<button className="btn-primary">
  Save
</button>
```

### Secondary Button

```jsx
<button className="btn-secondary">
  Cancel
</button>
```

### Input

```jsx
<input className="input w-full" />
```

### Success Badge

```jsx
<span className="badge-success">
  Verified
</span>
```

---

## 21. Final Design Principle

When building new screens, ask:

```txt
Does this feel clean, calm, trustworthy, and easy to use?
```

If a screen feels busy, reduce color, reduce decoration, increase spacing, and use clearer hierarchy.

The theme should make the app feel professional and clinical without feeling cold.