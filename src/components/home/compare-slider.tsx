"use client";

import { useCallback, useEffect, useRef, useState } from "react";

interface CompareSliderProps {
  afterShade?: string;
  /** CSS background for the untouched room (left pane). */
  beforeBg?: string;
  /** CSS background for the recoloured room (right pane). */
  afterBg?: string;
  /** Merged last over the root styles — e.g. pass marginTop: 0 outside the hero. */
  style?: React.CSSProperties;
}

const DEFAULT_BEFORE = "radial-gradient(ellipse at 50% 35%, rgba(255,250,235,.16), transparent 60%), linear-gradient(165deg, #5a5044 0%, #3a3127 55%, #1c1612 100%)";
const DEFAULT_AFTER = "radial-gradient(ellipse at 50% 35%, rgba(255,235,210,.28), transparent 60%), linear-gradient(160deg, #c87a55 0%, #9d5236 55%, #4d2618 100%)";

export function CompareSlider({
  afterShade = "Terracotta · AP-1428",
  beforeBg = DEFAULT_BEFORE,
  afterBg = DEFAULT_AFTER,
  style,
}: CompareSliderProps) {
  const [pos, setPos] = useState(55);
  const ref = useRef<HTMLDivElement>(null);
  const dragging = useRef(false);

  const updateFromClient = useCallback((clientX: number) => {
    const el = ref.current;
    if (!el) return;
    const rect = el.getBoundingClientRect();
    const next = ((clientX - rect.left) / rect.width) * 100;
    setPos(Math.max(2, Math.min(98, next)));
  }, []);

  useEffect(() => {
    const onMove = (e: PointerEvent) => {
      if (!dragging.current) return;
      updateFromClient(e.clientX);
    };
    const onUp = () => { dragging.current = false; };
    window.addEventListener("pointermove", onMove);
    window.addEventListener("pointerup", onUp);
    window.addEventListener("pointercancel", onUp);
    return () => {
      window.removeEventListener("pointermove", onMove);
      window.removeEventListener("pointerup", onUp);
      window.removeEventListener("pointercancel", onUp);
    };
  }, [updateFromClient]);

  return (
    <div
      className="compare reveal d2"
      ref={ref}
      style={{
        position: "relative",
        marginTop: 96,
        aspectRatio: "21 / 10",
        overflow: "hidden",
        userSelect: "none",
        cursor: "ew-resize",
        background: "var(--charcoal-warm)",
        touchAction: "pan-y",
        ...style,
      } as React.CSSProperties}
      onPointerDown={(e) => {
        dragging.current = true;
        e.currentTarget.setPointerCapture(e.pointerId);
        updateFromClient(e.clientX);
      }}
      onPointerMove={(e) => {
        if (dragging.current) updateFromClient(e.clientX);
      }}
    >
      {/* Base layer = recoloured room; the clipped layer on the left reveals the
          untouched "before" under its tag. */}
      <div style={{ position: "absolute", inset: 0, background: afterBg }} />
      <div style={{ position: "absolute", inset: 0, clipPath: `inset(0 calc(100% - ${pos}%) 0 0)`, background: beforeBg }} />
      <span style={tagStyle("left")}>Before</span>
      <span style={tagStyle("right")}>{afterShade}</span>
      <button
        type="button"
        aria-label="Drag to compare before and after"
        aria-valuemin={0}
        aria-valuemax={100}
        aria-valuenow={Math.round(pos)}
        role="slider"
        tabIndex={0}
        onKeyDown={(e) => {
          if (e.key === "ArrowLeft") setPos((p) => Math.max(2, p - 2));
          if (e.key === "ArrowRight") setPos((p) => Math.min(98, p + 2));
        }}
        style={{
          position: "absolute",
          top: 0,
          bottom: 0,
          left: `${pos}%`,
          width: 2,
          background: "var(--ivory)",
          transform: "translateX(-50%)",
          zIndex: 4,
          boxShadow: "0 0 20px rgba(0,0,0,.4)",
          padding: 0,
          border: "none",
          cursor: "ew-resize",
        }}
      >
        <span style={handleDotStyle} aria-hidden>‹  ›</span>
      </button>
    </div>
  );
}

const tagStyle = (side: "left" | "right"): React.CSSProperties => ({
  position: "absolute",
  top: 24,
  [side]: 24,
  font: "400 10px/1 var(--mono)",
  letterSpacing: ".3em",
  textTransform: "uppercase",
  color: "var(--ivory)",
  background: "rgba(21,17,13,.6)",
  backdropFilter: "blur(6px)",
  padding: "10px 14px",
  border: "1px solid rgba(235,229,215,.2)",
  zIndex: 3,
});

const handleDotStyle: React.CSSProperties = {
  position: "absolute",
  top: "50%",
  left: "50%",
  transform: "translate(-50%, -50%)",
  width: 56,
  height: 56,
  border: "1px solid var(--ivory)",
  background: "rgba(21,17,13,.7)",
  backdropFilter: "blur(6px)",
  borderRadius: "50%",
  color: "var(--ivory)",
  font: "400 18px/1 var(--mono)",
  letterSpacing: ".1em",
  display: "flex",
  alignItems: "center",
  justifyContent: "center",
};
