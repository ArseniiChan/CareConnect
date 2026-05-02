
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
      {/* Desktop / tablet top nav */}
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

      {/* Mobile top mini header */}
      <header className="sticky top-0 z-50 border-b border-border bg-white/90 backdrop-blur dark:border-border-dark dark:bg-background-dark/90 md:hidden">
        <div className="flex h-14 items-center justify-center px-4">
          <Link to="/" className="text-lg font-semibold tracking-tight">
            CareConnect
          </Link>
        </div>
      </header>

      {/* Page content */}
      <main className="mx-auto min-h-[calc(100vh-4rem)] max-w-6xl px-4 pb-24 pt-6 md:pb-8">
        <Outlet />
      </main>

      {/* Mobile bottom nav */}
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