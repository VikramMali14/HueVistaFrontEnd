"use client";

import { toggleUiThemeAction } from "@/lib/auth";
import type { UiTheme } from "@/lib/types";

interface ThemeToggleProps {
  /** Current theme — pass `await getUiTheme()` from the parent server layout. */
  theme: UiTheme;
  /** Override the rendered size. Defaults to a 36px square. */
  size?: number;
  /** Extra class names appended to the button. */
  className?: string;
}

export function ThemeToggle({ theme, size = 36, className = "" }: ThemeToggleProps) {
  const isDark = theme === "dark";
  const label = isDark ? "Switch to light" : "Switch to dark";
  return (
    <form action={toggleUiThemeAction} style={{ display: "inline-flex" }}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className={`theme-toggle ${className}`.trim()}
        style={{ width: size, height: size }}
      >
        {isDark ? <SunIcon /> : <MoonIcon />}
      </button>
    </form>
  );
}

function SunIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <circle cx="12" cy="12" r="4" />
      <path d="M12 2v2M12 20v2M4.93 4.93l1.41 1.41M17.66 17.66l1.41 1.41M2 12h2M20 12h2M4.93 19.07l1.41-1.41M17.66 6.34l1.41-1.41" />
    </svg>
  );
}

function MoonIcon() {
  return (
    <svg viewBox="0 0 24 24" width={16} height={16} fill="none" stroke="currentColor" strokeWidth="1.5" strokeLinecap="round" strokeLinejoin="round" aria-hidden>
      <path d="M21 12.79A9 9 0 1 1 11.21 3a7 7 0 0 0 9.79 9.79z" />
    </svg>
  );
}
