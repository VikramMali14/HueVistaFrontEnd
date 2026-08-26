import type { CSSProperties } from "react";

interface PhoneButtonProps {
  next?: string;
  label?: string;
  style?: CSSProperties;
}

/**
 * "Continue with mobile number" — a link to the two-step SMS flow at /sign-in/phone.
 *
 * <p>A link rather than a button, and deliberately so: pressing it must not pull the
 * ~200 kB Firebase auth SDK into the sign-in page for the many people who came here to
 * type a password. The SDK loads on the page it is actually needed on.
 *
 * <p>Styled to match {@link GoogleButton} so the two read as siblings — two ways in,
 * neither presented as the lesser one.
 */
export function PhoneButton({ next = "/dashboard", label = "Continue with mobile number", style }: PhoneButtonProps) {
  const href = `/sign-in/phone?next=${encodeURIComponent(next)}`;
  return (
    <a
      href={href}
      className="btn-google"
      style={{
        display: "inline-flex",
        alignItems: "center",
        justifyContent: "center",
        gap: 12,
        width: "100%",
        padding: "14px 18px",
        font: "500 13px/1 var(--sans)",
        letterSpacing: "0.02em",
        textTransform: "none",
        cursor: "pointer",
        textDecoration: "none",
        ...style,
      }}
      aria-label={label}
    >
      <PhoneGlyph />
      <span>{label}</span>
    </a>
  );
}

function PhoneGlyph() {
  return (
    <svg width={18} height={18} viewBox="0 0 18 18" aria-hidden fill="none" stroke="currentColor" strokeWidth={1.4}>
      <rect x="4.5" y="1.5" width="9" height="15" rx="2" />
      <line x1="7.5" y1="14" x2="10.5" y2="14" strokeLinecap="round" />
    </svg>
  );
}
