"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function RootError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[HueVista] route error:", error);
    }
  }, [error]);

  return (
    <main
      style={{
        minHeight: "70vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        textAlign: "center",
        padding: "80px 24px",
        background: "var(--bg)",
        color: "var(--fg)",
        gap: 18,
      }}
    >
      <span
        style={{
          font: "400 10.5px/1 var(--mono, ui-monospace, monospace)",
          letterSpacing: ".32em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        Something went wrong
      </span>
      <h1
        style={{
          fontFamily: "var(--serif, serif)",
          fontWeight: 600,
          fontSize: "clamp(40px, 6vw, 72px)",
          letterSpacing: "-.02em",
          margin: 0,
          maxWidth: "18ch",
        }}
      >
        We have <i style={{ color: "var(--accent-soft)" }}>misstepped.</i>
      </h1>
      <p
        style={{
          font: "400 18px/1.5 var(--serif, serif)",
          color: "var(--fg-soft)",
          maxWidth: 520,
          margin: 0,
        }}
      >
        An unexpected error occurred. You can retry the page, or return to the homepage and try again.
      </p>
      <div style={{ display: "inline-flex", gap: 12, flexWrap: "wrap", justifyContent: "center", marginTop: 8 }}>
        <button type="button" onClick={reset} className="btn">
          Try again
        </button>
        <Link href="/" className="btn btn-ghost">
          Return home
        </Link>
      </div>
      {error?.digest && (
        <p
          style={{
            font: "400 10px/1 var(--mono, ui-monospace, monospace)",
            letterSpacing: ".2em",
            textTransform: "uppercase",
            color: "var(--fg-mute)",
            marginTop: 24,
          }}
        >
          ref · {error.digest}
        </p>
      )}
    </main>
  );
}
