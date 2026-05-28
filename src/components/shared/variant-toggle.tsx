"use client";

import { toggleUiVariantAction } from "@/lib/auth";
import type { UiVariant } from "@/lib/types";

interface VariantToggleProps {
  /** Current variant — pass `await getUiVariant()` from the parent server layout. */
  variant: UiVariant;
  /** Extra class names appended to the button. */
  className?: string;
}

export function VariantToggle({ variant, className = "" }: VariantToggleProps) {
  const isPremium = variant === "premium";
  const target = isPremium ? "Classic" : "Premium";
  const label = `Switch to ${target.toLowerCase()} variant`;
  return (
    <form action={toggleUiVariantAction} style={{ display: "inline-flex" }}>
      <button
        type="submit"
        aria-label={label}
        title={label}
        className={`variant-toggle ${className}`.trim()}
      >
        {target}
      </button>
    </form>
  );
}
