"use client";

import { toggleUiLocaleAction } from "@/lib/auth";
import type { UiLocale } from "@/lib/types";

interface LocaleToggleProps {
  /** Current locale — pass `await getUiLocale()` from the parent server layout. */
  locale: UiLocale;
  /** Extra class names appended to the button. */
  className?: string;
}

export function LocaleToggle({ locale, className = "" }: LocaleToggleProps) {
  const target: UiLocale = locale === "en" ? "hi" : "en";
  const targetLabel = target === "hi" ? "हिं" : "EN";
  const label = target === "hi" ? "Switch to Hindi" : "Switch to English";
  return (
    <form action={toggleUiLocaleAction} style={{ display: "inline-flex" }}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className={`variant-toggle ${className}`.trim()}
      >
        {targetLabel}
      </button>
    </form>
  );
}
