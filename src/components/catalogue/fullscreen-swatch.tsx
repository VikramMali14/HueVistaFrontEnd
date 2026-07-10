"use client";

import { useEffect } from "react";
import type { PaintShade } from "@/lib/types";

interface FullscreenSwatchProps {
  /** One shade fills the screen; two split it left/right for an A/B compare. */
  shades: ReadonlyArray<PaintShade>;
  onClose: () => void;
  /** Guest mode hides real codes. */
  hideCodes?: boolean;
}

/**
 * "Hold to wall": fill the whole screen with the shade (or two, split) so the
 * phone becomes a giant shade card the customer can hold against the actual
 * wall. Requests true fullscreen where the browser allows it; Esc, the ✕, or
 * tapping the colour leaves.
 */
export function FullscreenSwatch({ shades, onClose, hideCodes = false }: FullscreenSwatchProps) {
  const pair = shades.slice(0, 2);

  useEffect(() => {
    const el = document.documentElement;
    // Best effort — iOS Safari has no Fullscreen API on iPhone; the fixed
    // overlay below still covers the viewport there.
    el.requestFullscreen?.().catch(() => {});
    const onKey = (e: KeyboardEvent) => {
      if (e.key === "Escape") onClose();
    };
    window.addEventListener("keydown", onKey);
    return () => {
      window.removeEventListener("keydown", onKey);
      if (document.fullscreenElement) document.exitFullscreen?.().catch(() => {});
    };
  }, [onClose]);

  if (pair.length === 0) return null;

  return (
    <div
      role="dialog"
      aria-label="Full-screen shade view"
      style={{ position: "fixed", inset: 0, zIndex: 200, display: "flex", cursor: "pointer" }}
      onClick={onClose}
    >
      {pair.map((s) => (
        <div key={s.code} style={{ flex: 1, background: s.hex, position: "relative" }}>
          <div
            style={{
              position: "absolute",
              left: 0,
              right: 0,
              bottom: 0,
              padding: "14px 18px calc(14px + env(safe-area-inset-bottom))",
              display: "flex",
              flexDirection: "column",
              gap: 3,
              background: "linear-gradient(transparent, rgba(10,9,8,.55))",
              color: "rgba(247,247,245,.92)",
            }}
          >
            <span style={{ font: "600 16px/1.2 var(--sans)" }}>{s.name}</span>
            {!hideCodes && (
              <span style={{ font: "400 10px/1 var(--mono)", letterSpacing: ".18em", textTransform: "uppercase", opacity: 0.8 }}>
                {s.code}
              </span>
            )}
          </div>
        </div>
      ))}
      <div
        style={{
          position: "absolute",
          top: "calc(12px + env(safe-area-inset-top))",
          left: 0,
          right: 0,
          display: "flex",
          alignItems: "center",
          justifyContent: "space-between",
          padding: "0 14px",
          pointerEvents: "none",
        }}
      >
        <span
          style={{
            font: "400 9px/1.4 var(--mono)",
            letterSpacing: ".18em",
            textTransform: "uppercase",
            color: "rgba(247,247,245,.85)",
            background: "rgba(10,9,8,.45)",
            padding: "7px 10px",
            borderRadius: 999,
          }}
        >
          Set brightness to full · hold next to the wall
        </span>
        <button
          type="button"
          aria-label="Close full-screen view"
          onClick={onClose}
          style={{
            pointerEvents: "auto",
            width: 38,
            height: 38,
            minHeight: 38,
            borderRadius: "50%",
            border: "1px solid rgba(247,247,245,.4)",
            background: "rgba(10,9,8,.45)",
            color: "rgba(247,247,245,.92)",
            cursor: "pointer",
            font: "400 16px/1 var(--sans)",
          }}
        >
          ✕
        </button>
      </div>
    </div>
  );
}
