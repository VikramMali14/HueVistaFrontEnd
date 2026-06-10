import type { CSSProperties, ReactNode } from "react";
import { Spinner } from "./spinner";

interface LoaderOverlayProps {
  show: boolean;
  label: ReactNode;
  hint?: ReactNode;
  progress?: number;
  style?: CSSProperties;
}

export function LoaderOverlay({ show, label, hint, progress, style }: LoaderOverlayProps) {
  if (!show) return null;
  const pct =
    typeof progress === "number" && Number.isFinite(progress)
      ? Math.max(0, Math.min(100, Math.round(progress * 100)))
      : null;
  return (
    <div
      role="status"
      aria-live="polite"
      style={{
        position: "absolute",
        inset: 0,
        zIndex: 30,
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 14,
        background: "var(--surface-overlay, rgba(0,0,0,.55))",
        backdropFilter: "blur(6px)",
        WebkitBackdropFilter: "blur(6px)",
        padding: 24,
        textAlign: "center",
        color: "var(--fg)",
        ...style,
      }}
    >
      <Spinner size={36} color="var(--accent)" label={typeof label === "string" ? label : "Loading"} />
      <div
        style={{
          font: "400 11px/1 var(--mono, ui-monospace, monospace)",
          letterSpacing: ".28em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        {label}
      </div>
      {hint && (
        <div
          style={{
            font: "400 15px/1.4 var(--serif, serif)",
            color: "var(--fg-soft)",
            maxWidth: 380,
          }}
        >
          {hint}
        </div>
      )}
      {pct !== null && (
        <div
          aria-hidden
          style={{
            width: 220,
            height: 2,
            background: "var(--rule, rgba(255,255,255,.15))",
            position: "relative",
            overflow: "hidden",
            marginTop: 4,
          }}
        >
          <div
            style={{
              position: "absolute",
              inset: 0,
              width: `${pct}%`,
              background: "var(--accent)",
              transition: "width .3s ease",
            }}
          />
        </div>
      )}
    </div>
  );
}
