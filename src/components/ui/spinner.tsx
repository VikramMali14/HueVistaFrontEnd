import type { CSSProperties } from "react";

interface SpinnerProps {
  size?: number;
  color?: string;
  label?: string;
  /** When the spinner sits inside another status/live region, render it
   *  decorative (no role/label) to avoid duplicate screen-reader announcements. */
  decorative?: boolean;
  style?: CSSProperties;
  className?: string;
}

export function Spinner({ size = 18, color = "currentColor", label = "Loading", decorative = false, style, className }: SpinnerProps) {
  const stroke = Math.max(1.5, size / 12);
  return (
    <span
      role={decorative ? undefined : "status"}
      aria-label={decorative ? undefined : label}
      aria-hidden={decorative ? true : undefined}
      className={className}
      style={{
        display: "inline-flex",
        width: size,
        height: size,
        verticalAlign: "middle",
        ...style,
      }}
    >
      <svg
        viewBox="0 0 24 24"
        width={size}
        height={size}
        aria-hidden
        style={{
          animation: "hv-spin 0.9s linear infinite",
        }}
      >
        <circle
          cx="12"
          cy="12"
          r="9"
          fill="none"
          stroke={color}
          strokeOpacity="0.18"
          strokeWidth={stroke}
        />
        <path
          d="M21 12a9 9 0 0 0-9-9"
          fill="none"
          stroke={color}
          strokeWidth={stroke}
          strokeLinecap="round"
        />
      </svg>
      <style>{`@keyframes hv-spin { to { transform: rotate(360deg); } }`}</style>
    </span>
  );
}
