"use client";

import { useEffect } from "react";
import Link from "next/link";

export default function AppError({
  error,
  reset,
}: {
  error: Error & { digest?: string };
  reset: () => void;
}) {
  useEffect(() => {
    if (process.env.NODE_ENV !== "production") {
      console.error("[HueVista] app error:", error);
    }
  }, [error]);
  return (
    <div
      role="alert"
      style={{
        minHeight: "60vh",
        display: "flex",
        flexDirection: "column",
        alignItems: "center",
        justifyContent: "center",
        gap: 16,
        textAlign: "center",
        padding: 40,
        color: "var(--fg)",
      }}
    >
      <span
        style={{
          font: "400 10.5px/1 var(--mono, ui-monospace, monospace)",
          letterSpacing: ".3em",
          textTransform: "uppercase",
          color: "var(--accent)",
        }}
      >
        Something went wrong
      </span>
      <h2
        style={{
          fontFamily: "var(--serif, serif)",
          fontWeight: 600,
          fontSize: "clamp(32px, 4vw, 56px)",
          margin: 0,
        }}
      >
        Could not load this page.
      </h2>
      <p
        style={{
          font: "400 17px/1.5 var(--serif, serif)",
          color: "var(--fg-soft)",
          maxWidth: 480,
          margin: 0,
        }}
      >
        Check your internet connection and retry. If it keeps happening, sign out and sign in again.
      </p>
      <div style={{ display: "inline-flex", gap: 12, marginTop: 8, flexWrap: "wrap", justifyContent: "center" }}>
        <button type="button" onClick={reset} className="btn">
          Retry
        </button>
        <Link href="/sign-in" className="btn btn-ghost">
          Sign in
        </Link>
      </div>
    </div>
  );
}
